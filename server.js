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
const TEAM_CAPACITY = [2, 2, 2, 2, 2, 2, 2, 2];
const BLOCKS = new Set(["stone", "plank", "brick", "glass", "obsidian", "tnt", "w0", "w1", "w2", "w3", "w4", "w5", "w6", "w7"]);
const makeCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms.has(code));
  return code;
};
const safeName = value => String(value || "Gracz").replace(/[<>]/g, "").trim().slice(0,16) || "Gracz";
const publicPlayers = room => [...room.players.values()].map(p => ({...p}));
function teamCount(room, team) {
  return [...room.players.values()].filter(p => p.team === team).length;
}
function sendRoom(room) {
  io.to(room.code).emit("room:players", publicPlayers(room));
}
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
  else sendRoom(room);
}
function addToRoom(socket, room, data, ack) {
  if (room.players.size >= 10) return typeof ack === "function" && ack({ok:false,error:"Pokój jest pełny (maksymalnie 10 graczy)."});
  const requested = Number.isInteger(Number(data && data.team)) ? Number(data.team) : -1;
  const team = requested >= 0 && requested < TEAM_CAPACITY.length && teamCount(room, requested) < TEAM_CAPACITY[requested]
    ? requested
    : TEAM_CAPACITY.findIndex((cap, i) => teamCount(room, i) < cap);
  if (team < 0) return typeof ack === "function" && ack({ok:false,error:"Wszystkie miejsca drużyn są zajęte."});
  const p = {id:socket.id,name:safeName(data && data.name),team,x:0,y:0,z:0,yaw:0,hp:20,alive:true};
  room.players.set(socket.id,p);
  playerRoom.set(socket.id,room.code);
  socket.join(room.code);
  if (typeof ack === "function") ack({ok:true,code:room.code,count:room.players.size,team,players:publicPlayers(room),blocks:[...room.blocks.values()]});
  socket.to(room.code).emit("player:join",p);
  sendRoom(room);
}
io.on("connection", socket => {
  socket.on("room:create", (data, ack) => {
    leaveRoom(socket);
    const code = makeCode();
    const room = {code, players:new Map(), blocks:new Map(), beds:new Map()};
    rooms.set(code, room);
    addToRoom(socket, room, data, ack);
  });
  socket.on("room:join", (data, ack) => {
    leaveRoom(socket);
    const code = String(data && data.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return typeof ack === "function" && ack({ok:false,error:"Nie ma pokoju o takim kodzie."});
    addToRoom(socket, room, data, ack);
  });
  socket.on("room:team", (data, ack) => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    const team=Number(data&&data.team);
    if(!p)return typeof ack==="function"&&ack({ok:false,error:"Najpierw dołącz do pokoju."});
    if(!Number.isInteger(team)||team<0||team>=TEAM_CAPACITY.length)return typeof ack==="function"&&ack({ok:false,error:"Nieprawidłowa drużyna."});
    if(p.team!==team&&teamCount(room,team)>=TEAM_CAPACITY[team])return typeof ack==="function"&&ack({ok:false,error:"Ta drużyna nie ma wolnych miejsc."});
    p.team=team;
    if(typeof ack==="function")ack({ok:true,team});
    sendRoom(room);
  });
  socket.on("player:state", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    if(!p||!data)return;
    for(const key of ["x","y","z","yaw","hp"])if(!Number.isFinite(data[key]))return;
    if(Math.abs(data.x)>1000||Math.abs(data.y)>500||Math.abs(data.z)>1000)return;
    p.name=safeName(data.name);p.x=data.x;p.y=data.y;p.z=data.z;p.yaw=data.yaw;
    p.hp=Math.max(0,Math.min(20,data.hp));p.alive=!!data.alive;
    const requestedTeam=Number(data.team);
    if(Number.isInteger(requestedTeam)&&requestedTeam>=0&&requestedTeam<TEAM_CAPACITY.length&&
       (requestedTeam===p.team||teamCount(room,requestedTeam)<TEAM_CAPACITY[requestedTeam]))p.team=requestedTeam;
    socket.to(code).volatile.emit("player:update",p);
  });
  socket.on("game:block:add", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    if(!p||!data||!BLOCKS.has(data.k))return;
    const {x,y,z,k}=data;
    if(![x,y,z].every(Number.isInteger)||Math.abs(x)>150||Math.abs(y)>80||Math.abs(z)>150)return;
    const key=x+","+y+","+z;
    if(room.blocks.size>5000)return;
    const team=Number.isInteger(data.team)&&data.team>=0&&data.team<=7?data.team:p.team;
    const block={x,y,z,k,team};
    room.blocks.set(key,block);
    socket.to(code).emit("game:block:add",{...block,by:socket.id});
  });
  socket.on("game:block:remove", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    if(!p||!data||![data.x,data.y,data.z].every(Number.isInteger))return;
    const key=data.x+","+data.y+","+data.z;
    room.blocks.delete(key);
    socket.to(code).emit("game:block:remove",{x:data.x,y:data.y,z:data.z,bedTeam:Number.isInteger(data.bedTeam)?data.bedTeam:null,by:socket.id});
  });
  socket.on("game:bed", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),p=room&&room.players.get(socket.id);
    const team=Number(data&&data.team);
    if(!p||!Number.isInteger(team)||team<0||team>7)return;
    room.beds.set(team,false);
    socket.to(code).emit("game:bed",{team,by:socket.id,name:p.name});
  });
  socket.on("game:attack", data => {
    const code=playerRoom.get(socket.id),room=code&&rooms.get(code),att=room&&room.players.get(socket.id);
    const target=room&&room.players.get(String(data&&data.target||""));
    if(!att||!target||att.id===target.id||att.team===target.team||!target.alive)return;
    if(Math.hypot(att.x-target.x,att.z-target.z)>6.5||Math.abs(att.y-target.y)>4)return;
    const damage=Math.max(1,Math.min(12,Number(data.damage)||4));
    io.to(target.id).emit("player:hit",{damage,from:{id:att.id,name:att.name,team:att.team,x:att.x,y:att.y,z:att.z},knockback:Math.max(4,Math.min(12,Number(data.knockback)||8))});
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
app.get("/", (_req,res) => res.type("text").send("BedWars multiplayer server is running."));
app.get("/health", (_req,res) => res.json({ok:true,rooms:rooms.size,players:playerRoom.size}));
server.listen(PORT, () => console.log("BedWars multiplayer działa na porcie " + PORT));
