const http = require("http");
const os = require("os");
const net = require("net");
const dns = require("dns").promises;
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const AGENT_VERSION = "0.4.0";
const PORT = Number(process.env.FIELDNET_AGENT_PORT || 47891);
const HOST = process.env.FIELDNET_AGENT_HOST || "0.0.0.0";
const DATA_DIR = path.join(process.cwd(), ".fieldnet");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const OUI_CSV = path.join(process.cwd(), "data", "oui.csv");

const COMMON_PORTS = [21,22,23,25,53,80,110,135,139,143,443,445,515,548,554,587,631,993,995,1433,1900,3306,3389,5000,5357,5432,5900,8000,8080,8443,8888,9100];
const HTTP_PORTS = new Set([80,443,5000,8000,8080,8443,8888]);

const BUILTIN_OUI = [
  ["E0:63:DA", "Ubiquiti / UniFi"], ["3C:52:82", "Ubiquiti / UniFi"], ["44:D9:E7", "Ubiquiti / UniFi"], ["78:8A:20", "Ubiquiti / UniFi"], ["F0:9F:C2", "Ubiquiti / UniFi"], ["B4:FB:E4", "Ubiquiti / UniFi"], ["DC:9F:DB", "Ubiquiti / UniFi"], ["FC:EC:DA", "Ubiquiti / UniFi"], ["70:A7:41", "Ubiquiti / UniFi"], ["24:A4:3C", "Ubiquiti / UniFi"], ["F4:92:BF", "Ubiquiti / UniFi"],
  ["00:11:32", "Synology"], ["00:08:9B", "QNAP"], ["24:5E:BE", "QNAP"],
  ["80:5E:C0", "Yealink"], ["00:15:65", "Yealink"], ["50:5D:AC", "Yealink"], ["00:13:22", "Grandstream"], ["00:0B:82", "Grandstream"], ["00:04:F2", "Polycom"],
  ["18:60:24", "HP"], ["B4:B5:2F", "HP"], ["3C:D9:2B", "HP"], ["00:1F:29", "HP"], ["D4:85:64", "HP"],
  ["30:05:5C", "Brother"], ["00:80:92", "Silex / Printer Adapter"], ["00:17:C8", "Kyocera"], ["00:1E:8F", "Canon"], ["00:21:B7", "Lexmark"], ["00:26:73", "Ricoh"], ["00:00:74", "Ricoh"],
  ["00:50:56", "VMware"], ["00:0C:29", "VMware"], ["00:05:69", "VMware"], ["08:00:27", "VirtualBox"], ["00:15:5D", "Microsoft Hyper-V"],
  ["B8:27:EB", "Raspberry Pi"], ["DC:A6:32", "Raspberry Pi"], ["E4:5F:01", "Raspberry Pi"],
  ["A4:2B:B0", "TP-Link"], ["50:C7:BF", "TP-Link"], ["D8:47:32", "TP-Link"], ["14:CC:20", "TP-Link"], ["E8:48:B8", "TP-Link"],
  ["00:13:A1", "Crow Electronic Engineering"], ["D8:CB:8A", "Micro-Star International"],
  ["D8:BB:C1", "Apple"], ["F0:18:98", "Apple"], ["A4:C3:F0", "Apple"], ["28:CF:E9", "Apple"], ["AC:DE:48", "Private / Randomized MAC"], ["B0:25:AA", "Private / Randomized MAC"],
  ["00:1A:11", "Google"], ["F4:F5:D8", "Google"], ["18:B4:30", "Nest / Google"], ["CC:50:E3", "Amazon"], ["F0:27:2D", "Amazon"],
  ["00:1B:44", "SanDisk"], ["00:90:A9", "Western Digital"], ["00:14:FD", "Western Digital"],
  ["00:25:90", "Supermicro"], ["F4:4D:30", "Elitegroup / Mini PC"], ["88:AE:DD", "Intel / NUC-class endpoint"],
  ["00:E0:4C", "Realtek"], ["F8:1A:67", "Dell"], ["18:66:DA", "Dell"], ["3C:2C:30", "Dell"], ["54:EE:75", "Wistron / PC OEM"],
];

let vendorTable;
function ensureDirs() { fs.mkdirSync(HISTORY_DIR, { recursive: true }); }
function normalizeMac(mac) { return mac ? mac.replace(/-/g, ":").toUpperCase() : null; }
function oui(mac) { const m = normalizeMac(mac); return m ? m.split(":").slice(0,3).join(":") : null; }
function loadVendorTable() {
  if (vendorTable) return vendorTable;
  vendorTable = new Map(BUILTIN_OUI);
  if (fs.existsSync(OUI_CSV)) {
    for (const line of fs.readFileSync(OUI_CSV, "utf8").split(/\r?\n/)) {
      const [prefix, ...rest] = line.split(",");
      const vendor = rest.join(",").trim().replace(/^"|"$/g, "");
      const clean = normalizeMac((prefix || "").trim());
      if (clean && vendor) vendorTable.set(clean.split(":").slice(0,3).join(":"), vendor);
    }
  }
  return vendorTable;
}
function lookupVendor(mac) { const prefix = oui(mac); return prefix ? (loadVendorTable().get(prefix) || "Unknown") : "Unknown"; }
function vendorFamily(vendor) {
  const v = (vendor || "").toLowerCase();
  if (/ubiquiti|unifi/.test(v)) return "unifi";
  if (/synology|qnap|western digital|wd/.test(v)) return "nas";
  if (/yealink|grandstream|polycom/.test(v)) return "voip";
  if (/hp|hewlett|brother|canon|kyocera|lexmark|ricoh|epson|printer/.test(v)) return "printer";
  if (/vmware|virtualbox|hyper-v/.test(v)) return "virtual";
  if (/micro-star|intel|dell|elitegroup|pc oem|realtek|wistron/.test(v)) return "pc";
  if (/crow electronic/.test(v)) return "security";
  if (/raspberry/.test(v)) return "iot";
  if (/apple/.test(v)) return "apple";
  return "generic";
}
function getLocalIPv4Interfaces() {
  const results = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const e of entries || []) if (e.family === "IPv4" && !e.internal) results.push({ name, address: e.address, netmask: e.netmask, mac: e.mac, cidr: e.cidr });
  }
  return results.sort((a,b)=>(/ethernet/i.test(a.name)?0:/wi-?fi|wireless/i.test(a.name)?1:2)-(/ethernet/i.test(b.name)?0:/wi-?fi|wireless/i.test(b.name)?1:2));
}
function getSubnetHosts(ip) { const p = ip.split(".").slice(0,3).join("."); return Array.from({length:254},(_,i)=>`${p}.${i+1}`); }
function ipToNumber(ip) { return ip.split(".").map(Number).reduce((a,p)=>a*256+p,0); }
function execFileText(cmd,args,timeoutMs=3500){return new Promise(r=>execFile(cmd,args,{timeout:timeoutMs,windowsHide:true},(e,out)=>r(e?"":out||"")));}
async function warmArp(hosts, timeoutMs){ if(process.platform!=="win32")return; await runWithConcurrency(hosts,64,ip=>execFileText("ping.exe",["-n","1","-w",String(timeoutMs),ip],timeoutMs+500)); }
async function getArpTable(){ const out=await execFileText(process.platform==="win32"?"arp.exe":"arp",["-a"],5000); const t=new Map(); const re=/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:-]{11,17})\s+(dynamic|static)?/g; let m; while((m=re.exec(out)))t.set(m[1],normalizeMac(m[2])); return t; }
async function getNetbios(ip){ if(process.platform!=="win32")return {name:null,user:null,os:null}; const out=await execFileText("nbtstat.exe",["-A",ip],2500); let name=null,user=null; for(const line of out.split(/\r?\n/)){ const h=line.match(/^\s*([^\s<]+)\s+<00>\s+UNIQUE/i); const u=line.match(/^\s*([^\s<]+)\s+<03>\s+UNIQUE/i); if(h&&!/WORKGROUP|MSBROWSE/i.test(h[1]))name=h[1].trim(); if(u&&u[1]!==name)user=u[1].trim(); } return {name,user,os:out?"Windows/NetBIOS-capable host":null}; }
async function reverseDns(ip){ try{const n=await Promise.race([dns.reverse(ip),new Promise(res=>setTimeout(()=>res([]),1500))]); return Array.isArray(n)&&n[0]?n[0]:null;}catch{return null;} }
function probe(ip,port,timeoutMs){const start=Date.now();return new Promise(res=>{let done=false;const s=new net.Socket();const finish=(open,error)=>{if(done)return;done=true;s.destroy();res({ip,port,open,latencyMs:Date.now()-start,error});};s.setTimeout(timeoutMs);s.once("connect",()=>finish(true));s.once("timeout",()=>finish(false,"timeout"));s.once("error",e=>finish(false,e.code||e.message));s.connect(port,ip);});}
async function httpGrab(ip,port,timeoutMs=1800){ if(!HTTP_PORTS.has(port))return null; const scheme=port===443||port===8443?"https":"http"; const url=`${scheme}://${ip}:${port}/`; const c=new AbortController(); const timer=setTimeout(()=>c.abort(),timeoutMs); try{ const r=await fetch(url,{signal:c.signal}); const html=await r.text().catch(()=>""); return {url,status:r.status,title:html.match(/<title[^>]*>([^<]{1,160})<\/title>/i)?.[1]?.trim()||null,server:r.headers.get("server"),poweredBy:r.headers.get("x-powered-by")}; }catch(e){return {url,error:e.name||e.message};} finally{clearTimeout(timer);} }
async function shares(host){ if(process.platform!=="win32")return []; const out=await execFileText("net.exe",["view",`\\\\${host}`],5000); if(!out||/System error|Access is denied|network path/i.test(out))return []; return out.split(/\r?\n/).map(l=>l.match(/^\s*([^\s$][^\s]*)\s+(Disk|Print)/i)).filter(Boolean).map(m=>({name:m[1],type:m[2]})); }
async function udpDiscovery(){ return [...await ssdp(), ...await mdns()]; }
async function ssdp(timeoutMs=1400){ const msg=Buffer.from(["M-SEARCH * HTTP/1.1","HOST: 239.255.255.250:1900","MAN: \"ssdp:discover\"","MX: 1","ST: ssdp:all","",""] .join("\r\n")); return udp("239.255.255.250",1900,msg,timeoutMs,(m,r)=>{const h={}; for(const l of m.toString().split(/\r?\n/)){const i=l.indexOf(":"); if(i>0)h[l.slice(0,i).toLowerCase()]=l.slice(i+1).trim();} return {ip:r.address,protocol:"SSDP",server:h.server,st:h.st,usn:h.usn,location:h.location};}); }
async function mdns(timeoutMs=1400){ const q=Buffer.from("000000000001000000000000095f7365727669636573075f646e732d7364045f756470056c6f63616c00000c0001","hex"); return udp("224.0.0.251",5353,q,timeoutMs,(m,r)=>({ip:r.address,protocol:"mDNS",rawBytes:m.length})); }
function udp(addr,port,msg,timeoutMs,parser){return new Promise(res=>{const s=dgram.createSocket({type:"udp4",reuseAddr:true});const out=[];const timer=setTimeout(()=>{s.close();res(out);},timeoutMs);s.on("message",(m,r)=>{const p=parser(m,r); if(p)out.push(p);});s.on("error",()=>{clearTimeout(timer);s.close();res(out);});s.bind(()=>{try{s.setMulticastTTL(2);}catch{} s.send(msg,0,msg.length,port,addr);});});}
async function runWithConcurrency(items,concurrency,worker){let i=0;await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(i<items.length){const n=i++; await worker(items[n],n);}}));}
function serviceName(port){return ({21:"FTP",22:"SSH",23:"Telnet",25:"SMTP",53:"DNS",80:"HTTP",110:"POP3",135:"MS RPC",139:"NetBIOS",143:"IMAP",443:"HTTPS",445:"SMB",515:"LPD Print",548:"AFP",554:"RTSP Camera/Media",587:"SMTP Submission",631:"IPP",993:"IMAPS",995:"POP3S",1433:"MSSQL",1900:"SSDP/UPnP TCP",3306:"MySQL",3389:"RDP",5000:"UPnP/Synology/API",5357:"WSDAPI",5432:"PostgreSQL",5900:"VNC",8000:"HTTP Alternate",8080:"HTTP Alternate",8443:"HTTPS Alternate",8888:"HTTP Dev/Admin",9100:"JetDirect Print"})[port]||`TCP ${port}`;}
function risk(port){ if([21,23].includes(port))return"high"; if([80,110,135,139,445,1433,3306,3389,5432,5900,8000,8080,8888].includes(port))return"medium"; return"low"; }
function infer(ip,ports,hostname,mac,http,shares,discovery){ const vendor=lookupVendor(mac); const fam=vendorFamily(vendor); const lower=`${hostname||""} ${vendor} ${http.map(h=>h?.title||"").join(" ")} ${discovery.map(d=>d.server||d.st||"").join(" ")}`.toLowerCase(); const has=(...p)=>p.some(x=>ports.includes(x)); const all=(...p)=>p.every(x=>ports.includes(x)); let type="unknown",name="Discovered Host",role=ports.length?"Generic TCP host":"ARP-only active host";
  if(fam==="unifi"){type=has(22,80,443,8080,8443)?"access_point":"unknown"; name="Ubiquiti UniFi Device"; role="UniFi network device, AP, gateway, switch, or controller-managed endpoint";}
  else if(fam==="voip"){type="voip_phone"; name=`${vendor} VoIP Phone`; role="VoIP/SIP desk phone or voice endpoint";}
  else if(fam==="nas"){type="server"; name=`${vendor} NAS`; role="Network attached storage / file sharing appliance";}
  else if(fam==="printer"){type="printer"; name=`${vendor} Printer`; role="Network printer or print appliance";}
  else if(fam==="virtual"){type="server"; name=`${vendor} Virtual Machine`; role="Virtualized server or VM endpoint";}
  else if(fam==="pc"){type="workstation"; name=`${vendor} Workstation`; role="PC, NUC, workstation, or small server";}
  else if(fam==="security"){type="iot"; name=`${vendor} Security Device`; role="Alarm/security or building systems device";}
  else if(fam==="iot"){type="iot"; name=`${vendor} Device`; role="Single-board computer or IoT endpoint";}
  else if(ip.endsWith(".1")){type="router";name="Likely Gateway / Router";role="Default gateway candidate";}
  else if(has(515,631,9100)||/printer|print|canon|brother|hp|epson|xerox|kyocera/.test(lower)){type="printer";name="Network Printer";role="Print endpoint";}
  else if(has(554)||/camera|nvr|dvr|hikvision|axis|onvif|rtsp/.test(lower)){type="camera";name="Camera / Media Device";role="Video/NVR/RTSP endpoint";}
  else if(all(139,445)||has(548)||shares.length||/nas|synology|qnap|storage|file/.test(lower)){type="server";name="File Sharing Host / NAS";role="SMB/AFP/share endpoint";}
  else if(has(1433,3306,5432)){type="server";name="Database Server";role="Database endpoint";}
  else if(has(3389)){type="workstation";name="Windows RDP Host";role="Windows workstation/server with RDP";}
  else if(has(22)&&has(80,443,8080,8443)){type="unknown";name="Managed Network Device";role="Network appliance or Linux admin host";}
  else if(has(80,443,8080,8443,8888,5000)){type="unknown";name="Web Managed Device";role="Web management or web service";}
  else if(has(22)){type="server";name="SSH Host";role="Linux/network appliance endpoint";}
  else if(vendor!=="Unknown"){name=`${vendor} Device`; role=`Vendor identified from MAC prefix ${oui(mac)}`;}
  if(hostname) name=`${name} (${hostname})`;
  const confidence=Math.min(35+(hostname?20:0)+(vendor!=="Unknown"?25:0)+(mac?10:0)+(ports.length>=3?10:0)+(shares.length?15:0)+(http.some(Boolean)?8:0),98);
  return {name,type,role,vendor,confidence,vendorPrefix:oui(mac),vendorFamily:fam}; }
function finding(scanId,deviceId,ip,port){const base={id:`risk-${deviceId}-${port}`,scanId,deviceId,evidence:`TCP ${port} reachable on ${ip}`,status:"open"}; if(port===23)return{...base,severity:"high",title:"Telnet detected",recommendation:"Disable Telnet and use SSH."}; if(port===21)return{...base,severity:"high",title:"FTP detected",recommendation:"Replace FTP with SFTP/SCP/HTTPS."}; if([80,8000,8080,8888].includes(port))return{...base,severity:"medium",title:"Unencrypted HTTP service detected",recommendation:"Prefer HTTPS or restrict access to a management VLAN."}; if([139,445].includes(port))return{...base,severity:"medium",title:"File sharing service detected",recommendation:"Confirm SMB/NetBIOS exposure is expected and restricted."}; if([3389,5900].includes(port))return{...base,severity:"medium",title:"Remote access service detected",recommendation:"Restrict remote access to admin networks or VPN."}; if([1433,3306,5432].includes(port))return{...base,severity:"medium",title:"Database service detected",recommendation:"Restrict database access to app/admin networks."}; return null;}
function csv(result){const rows=[["Name","IP","Hostname","MAC","Vendor","VendorPrefix","Type","Status","LatencyMs","OpenPorts","Services","Risks","Notes"]]; for(const d of result.devices){const ss=result.services.filter(s=>s.deviceId===d.id); const rr=result.risks.filter(r=>r.deviceId===d.id); rows.push([d.name,d.ip,d.hostname||"",d.mac||"",d.vendor||"",d.fingerprint?.vendorPrefix||"",d.type,d.status,String(d.latencyMs||""),ss.map(s=>s.port).join(" "),ss.map(s=>s.name).join("; "),rr.map(r=>r.title).join("; "),d.notes||""]);} return rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");}
function save(result){ensureDirs();fs.writeFileSync(path.join(HISTORY_DIR,`${result.scan.id}.json`),JSON.stringify(result,null,2));fs.writeFileSync(path.join(DATA_DIR,"latest.json"),JSON.stringify(result,null,2));fs.writeFileSync(path.join(HISTORY_DIR,`${result.scan.id}.csv`),csv(result));}
async function scan(options={}){const {interfaceAddress,maxHosts=254,timeoutMs=650,concurrency=48,ports=COMMON_PORTS,includeArpOnly=true,includeUdpDiscovery=true,includeShares=true,includeHttp=true}=options; const iface=interfaceAddress?getLocalIPv4Interfaces().find(i=>i.address===interfaceAddress):getLocalIPv4Interfaces()[0]; if(!iface)throw new Error("No active non-loopback IPv4 interface found."); const subnet=iface.address.split(".").slice(0,3).join(".")+".0/24"; const prefix=subnet.slice(0,subnet.lastIndexOf(".")); const hosts=getSubnetHosts(iface.address).slice(0,maxHosts); const scanId=`scan-${Date.now()}`; const startedAt=new Date().toISOString(); const devices=[],services=[],risks=[]; await warmArp(hosts,Math.min(timeoutMs,450)); let arp=await getArpTable(); const discovery=includeUdpDiscovery?await udpDiscovery():[]; const byUdp=new Map(); for(const d of discovery)byUdp.set(d.ip,[...(byUdp.get(d.ip)||[]),d]); const byTcp=new Map(); await runWithConcurrency(hosts,concurrency,async ip=>{const open=(await Promise.all(ports.map(p=>probe(ip,p,timeoutMs)))).filter(r=>r.open).sort((a,b)=>a.port-b.port); if(open.length)byTcp.set(ip,open);}); arp=await getArpTable(); const candidates=new Set([...byTcp.keys(),...byUdp.keys()]); if(includeArpOnly)for(const ip of arp.keys())if(ip.startsWith(prefix))candidates.add(ip); await runWithConcurrency([...candidates].sort((a,b)=>ipToNumber(a)-ipToNumber(b)),24,async ip=>{const open=byTcp.get(ip)||[]; const nums=open.map(r=>r.port); const mac=arp.get(ip)||null; const [rd,nb]=await Promise.all([reverseDns(ip),getNetbios(ip)]); const hostname=nb.name||rd||null; const http=includeHttp?(await Promise.all(open.filter(r=>HTTP_PORTS.has(r.port)).map(r=>httpGrab(ip,r.port)))).filter(Boolean):[]; const sh=includeShares&&(nums.includes(139)||nums.includes(445))?await shares(hostname||ip):[]; const disc=byUdp.get(ip)||[]; const p=infer(ip,nums,hostname,mac,http,sh,disc); const id=`device-${ip.replaceAll(".","-")}`; const extra=[]; if(nb.user)extra.push(`User: ${nb.user}`); if(nb.os)extra.push(`OS hint: ${nb.os}`); if(sh.length)extra.push(`Shares: ${sh.map(s=>s.name).join(", ")}`); if(http.length)extra.push(`HTTP: ${http.map(h=>`${h.url}${h.title?` (${h.title})`:""}${h.server?` [${h.server}]`:""}`).join("; ")}`); if(disc.length)extra.push(`Discovery: ${disc.map(d=>d.protocol).join(", ")}`); const note=`Vendor: ${p.vendor}${p.vendorPrefix?` (${p.vendorPrefix})`:""}. Role: ${p.role}. Confidence: ${p.confidence}%. Open ports: ${nums.join(", ")||"none"}. ${extra.join(" ")}`.trim(); devices.push({id,scanId,name:p.name,ip,mac:mac||undefined,hostname:hostname||undefined,vendor:p.vendor,type:p.type,latencyMs:open.length?Math.min(...open.map(r=>r.latencyMs)):undefined,status:open.some(r=>[21,23,80,135,139,445,3389,5900,8000,8080,8888].includes(r.port))?"risk":"online",isKnown:false,notes:note,fingerprint:{role:p.role,confidence:p.confidence,openPorts:nums,source:"tcp+arp+dns+netbios+shares+http+ssdp+mdns+vendor",vendorPrefix:p.vendorPrefix,vendorFamily:p.vendorFamily},shares:sh,http,discovery:disc,os:nb.os||undefined,user:nb.user||undefined}); for(const r of open){const sid=`service-${ip.replaceAll(".","-")}-${r.port}`; const h=http.find(x=>x.url.includes(`:${r.port}/`)); services.push({id:sid,deviceId:id,port:r.port,protocol:"tcp",name:serviceName(r.port),description:`TCP connect succeeded in ${r.latencyMs} ms${h?.title?` · title: ${h.title}`:""}${h?.server?` · server: ${h.server}`:""}`,riskLevel:risk(r.port)}); const f=finding(scanId,id,ip,r.port); if(f)risks.push(f);}}); devices.sort((a,b)=>ipToNumber(a.ip)-ipToNumber(b.ip)); const result={scan:{id:scanId,siteId:"desktop-agent",networkName:iface.name,subnet,gatewayIp:iface.address.split(".").slice(0,3).join(".")+".1",startedAt,completedAt:new Date().toISOString(),deviceCount:devices.length,riskCount:risks.length},devices,services,risks,warning:"Vendor-aware agent: ARP-only inventory, TCP, DNS, NetBIOS, Windows shares, HTTP titles/banners, SSDP/mDNS, history, CSV/JSON export, and richer vendor/device identity.",agent:{version:AGENT_VERSION,interface:iface,scannedHosts:hosts.length,scannedPorts:ports,capabilities:["vendor-aware-identity","oui-csv-loader","tcp","arp-only","reverse-dns","netbios","shares","http-title-banner","ssdp","mdns","history","csv","json"]}}; save(result); return result;}
function send(res,code,payload,type="application/json"){const body=type==="application/json"?JSON.stringify(payload,null,2):payload;res.writeHead(code,{"Content-Type":type,"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"});res.end(body);} function latest(){const f=path.join(DATA_DIR,"latest.json");return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,"utf8")):null;}
const server=http.createServer(async(req,res)=>{ensureDirs();const url=new URL(req.url,`http://${req.headers.host}`); if(req.method==="OPTIONS")return send(res,200,{ok:true}); if(url.pathname==="/health")return send(res,200,{ok:true,name:"fieldnet-scout-agent",version:AGENT_VERSION,interfaces:getLocalIPv4Interfaces(),vendorPrefixes:loadVendorTable().size,externalOuiCsv:fs.existsSync(OUI_CSV),capabilities:["vendor-aware-identity","oui-csv-loader","arp-only-devices","tcp-connect-scan","reverse-dns","netbios","windows-shares","http-title-banner","ssdp","mdns","persistent-history","csv-export","json-export"]}); if(url.pathname==="/scan"&&req.method==="POST"){let body="";req.on("data",c=>body+=c);req.on("end",async()=>{try{send(res,200,await scan(body?JSON.parse(body):{}));}catch(e){send(res,500,{error:e.message||String(e)});}});return;} if(url.pathname==="/history"){const files=fs.readdirSync(HISTORY_DIR).filter(f=>f.endsWith(".json")).sort().reverse();return send(res,200,files.map(f=>JSON.parse(fs.readFileSync(path.join(HISTORY_DIR,f),"utf8")).scan));} if(url.pathname==="/latest.json")return send(res,200,latest()||{error:"No scan history yet"}); if(url.pathname==="/latest.csv"){const l=latest();return send(res,l?200:404,l?csv(l):"No scan history yet","text/csv");} send(res,404,{error:"Not found"});});
server.listen(PORT,HOST,()=>{ensureDirs();console.log(`FieldNet Scout vendor-aware scanner agent v${AGENT_VERSION} listening on http://${HOST}:${PORT}`);getLocalIPv4Interfaces().forEach(i=>console.log(`- ${i.name}: ${i.address} (${i.cidr||i.netmask})`));console.log(`Vendor prefixes loaded: ${loadVendorTable().size}${fs.existsSync(OUI_CSV)?" plus data/oui.csv":""}`);console.log("Endpoints: /health, POST /scan, /history, /latest.json, /latest.csv");});
