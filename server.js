const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"]
});
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const playerRoom = new Map();
const makeCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
};
const safeName = value => String(value || "Gracz").replace(/[<>]/g, "").trim().slice(0,16) || "Gracz";
const publicPlayers = room => [...room.players.values()].map(p => ({...p}));
function leaveRoom(socket) {
  const code = playerRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  playerRoom.delete(socket.id);
  socket.leave(code);
  if (!room) return;
  room.players.delete(socket.id);
  socket.to(code).emit("player:leave", socket.id);
  if (room.players.size === 0) rooms.delete(code);
  else io.to(code).emit("room:players", publicPlayers(room));
}
io.on("connection", socket => {
  socket.on("room:create", (data, ack) => {
    leaveRoom(socket);
    const code = makeCode();
    const room = { code, players: new Map() };
    rooms.set(code, room);
    joinRoom(socket, room, data, ack);
  });
  socket.on("room:join", (data, ack) => {
    leaveRoom(socket);
    const code = String(data && data.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return typeof ack === "function" && ack({ok:false,error:"Nie ma pokoju o takim kodzie."});
    if (room.players.size >= 10) return typeof ack === "function" && ack({ok:false,error:"Pokój jest pełny (maksymalnie 10 graczy)."});
    joinRoom(socket, room, data, ack);
  });
  function joinRoom(socket, room, data, ack) {
    if (room.players.size >= 10) {
      if (room.players.size === 0) rooms.delete(room.code);
      return typeof ack === "function" && ack({ok:false,error:"Pokój jest pełny."});
    }
    const team = room.players.size % 8;
    const p = {id:socket.id,name:safeName(data && data.name),team,x:0,y:0,z:0,yaw:0,hp:20,alive:true};
    room.players.set(socket.id,p);
    playerRoom.set(socket.id,room.code);
    socket.join(room.code);
    if (typeof ack === "function") ack({ok:true,code:room.code,count:room.players.size,team});
    socket.emit("room:players",publicPlayers(room));
    socket.to(room.code).emit("player:join",p);
    io.to(room.code).emit("room:players",publicPlayers(room));
  }
  socket.on("player:state", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    if (!p || !data) return;
    for (const key of ["x","y","z","yaw","hp"]) {
      if (!Number.isFinite(data[key])) return;
    }
    if (Math.abs(data.x)>1000 || Math.abs(data.y)>500 || Math.abs(data.z)>1000) return;
    p.name=safeName(data.name);
    p.x=data.x;p.y=data.y;p.z=data.z;p.yaw=data.yaw;
    p.hp=Math.max(0,Math.min(20,data.hp));p.alive=!!data.alive;
    socket.to(code).volatile.emit("player:update",p);
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
app.get("/", (_req,res) => res.type("text").send("BedWars multiplayer server is running."));
app.get("/health", (_req,res) => res.json({ok:true,rooms:rooms.size,players:playerRoom.size}));
function listen(port) {
  server.listen(port, () => console.log("BedWars multiplayer działa na porcie " + port));
}
listen(PORT);
function joinRoom(socket, room, data, ack) {
  if (room.players.size >= 10) return typeof ack === "function" && ack({ok:false,error:"Pokój jest pełny."});
  const team = room.players.size % 8;
  const p = {id:socket.id,name:safeName(data && data.name),team,x:0,y:0,z:0,yaw:0,hp:20,alive:true};
  room.players.set(socket.id,p);playerRoom.set(socket.id,room.code);socket.join(room.code);
  if (typeof ack === "function") ack({ok:true,code:room.code,count:room.players.size,team});
  socket.emit("room:players",publicPlayers(room));socket.to(room.code).emit("player:join",p);
  io.to(room.code).emit("room:players",publicPlayers(room));
}
