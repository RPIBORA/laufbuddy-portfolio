import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {getFirestore,doc,onSnapshot,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';
const config={apiKey:'AIzaSyBS5mV3Sf1TNV__Dz_wnVJ9X242gEd8Twg',authDomain:'laufbuddy-v2.firebaseapp.com',projectId:'laufbuddy-v2',storageBucket:'laufbuddy-v2.firebasestorage.app',messagingSenderId:'862089167524',appId:'1:862089167524:web:d426f35627cc86650cdc31'};
const id=location.pathname.split('/').filter(Boolean).at(-1), $=s=>document.querySelector(s), ms=v=>v?.toMillis?v.toMillis():null;
let connection,session,timer,callRevision,map,routeLayer,runnerMarker,mapCentered=false;
const age=n=>{const s=Math.max(0,Math.floor(n/1000));return s<60?`${s} Sekunden`:`${Math.floor(s/60)} Minute${s>119?'n':''} ${s%60} Sekunden`};
function validPoint(p){return !!p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)}

function ensureMap(){
  if(map)return;

  const L=window.L;
  if(!L)throw new Error('Leaflet konnte nicht geladen werden.');

  map=L.map('route',{
    zoomControl:true,
    attributionControl:true
  }).setView([51.1657,10.4515],6);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  routeLayer=L.polyline([],{
    color:'#1684af',
    weight:5,
    opacity:0.9,
    lineCap:'round',
    lineJoin:'round'
  }).addTo(map);

  runnerMarker=L.circleMarker([0,0],{
    radius:8,
    color:'#ffffff',
    weight:3,
    fillColor:'#e53935',
    fillOpacity:1
  });

  setTimeout(()=>map.invalidateSize(),0);
}

function route(points,lastPosition){
  ensureMap();

  const valid=Array.isArray(points)
    ? points.filter(validPoint)
    : [];

  const latlngs=valid.map(
    point=>[point.latitude,point.longitude]
  );

  routeLayer.setLatLngs(latlngs);

  let latest=null;

  if(validPoint(lastPosition)){
    latest=[lastPosition.latitude,lastPosition.longitude];
  }else if(latlngs.length){
    latest=latlngs[latlngs.length-1];
  }

  if(!latest)return;

  if(!map.hasLayer(runnerMarker)){
    runnerMarker.addTo(map);
  }

  runnerMarker.setLatLng(latest);

  if(!mapCentered){
    if(latlngs.length>1){
      map.fitBounds(routeLayer.getBounds(),{
        padding:[30,30],
        maxZoom:17
      });
    }else{
      map.setView(latest,16);
    }

    mapCentered=true;
    setTimeout(()=>map.invalidateSize(),0);
    return;
  }

  if(!map.getBounds().contains(latest)){
    map.panTo(latest);
  }
}
function render(){if(!session)return;if(session.sessionStatus==='ended'){$('#live').hidden=true;$('#state').hidden=false;$('#state').textContent='Diese Live-Sitzung ist beendet.';clearInterval(timer);return}const now=Date.now(),gps=ms(session.lastPositionReceivedAt),data=ms(session.lastAppHeartbeatAt),dataLost=!data||now-data>=15000,gpsLost=!gps||now-gps>=15000,p=session.lastPosition;$('#position-age').textContent=gps?`Letzte Position vor ${age(now-gps)}.`:'Noch keine Position empfangen.';$('#data-status').textContent=dataLost?'Datenverbindung verloren – keine Live-Ortung möglich.':'Datenverbindung aktiv.';$('#gps-status').textContent=gpsLost?'GPS-Signal verloren – Datenverbindung aktiv.':'GPS-Signal aktiv.';$('#position').textContent=p?`Letzte Position: ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`:'Noch keine Position empfangen.';$('#distance').textContent=typeof session.distanceKm==='number'?`${session.distanceKm.toFixed(2)} km`:'–';$('#duration').textContent=typeof session.durationSeconds==='number'?age(session.durationSeconds*1000):'–';$('#pace').textContent=typeof session.averagePaceSecondsPerKm==='number'?`${Math.floor(session.averagePaceSecondsPerKm/60)}:${String(session.averagePaceSecondsPerKm%60).padStart(2,'0')} min/km`:'–';route(session.route,p);if(session.callAttemptRevision&&session.callAttemptRevision!==callRevision){callRevision=session.callAttemptRevision;$('#call').textContent=`${session.runnerName||'LaufBuddy'} versucht Sie zu erreichen. Bitte nehmen Sie den Anruf an.`;$('#call').hidden=false}}
async function beat(status='connected'){await setDoc(connection,{status,lastHeartbeatAt:serverTimestamp(),confirmedAt:serverTimestamp()},{merge:true})}
async function main(){if(!/^[a-f0-9]{64}$/.test(id||'')){ $('#state').textContent='Dieser Live-Link ist ungültig.';return }const credential=await signInAnonymously(getAuth(initializeApp(config)));const db=getFirestore();connection=doc(db,'liveSessions',id,'connections',credential.user.uid);onSnapshot(doc(db,'liveSessions',id),snap=>{if(!snap.exists()){$('#state').hidden=false;$('#live').hidden=true;$('#state').textContent='Diese Live-Sitzung ist nicht verfügbar.';return}session=snap.data();$('#state').hidden=true;$('#live').hidden=false;render()},()=>$('#state').textContent='Live-Daten können gerade nicht geladen werden.');try { await beat(); } catch (e) { console.warn('Beat delayed:', e); }timer=setInterval(()=>beat().catch(()=>undefined),5000);setInterval(render,1000);$('#confirm').onclick=async()=>{await setDoc(connection,{status:'connected',confirmedAt:serverTimestamp(),lastHeartbeatAt:serverTimestamp()},{merge:true});$('#confirm').disabled=true;$('#confirm').textContent='Begleitung bestätigt'};$('#end').onclick=async()=>{await setDoc(connection,{status:'ended',endedAt:serverTimestamp(),endedRevision:Date.now(),lastHeartbeatAt:serverTimestamp()},{merge:true});clearInterval(timer);$('#end').disabled=true}}
main().catch(()=>{ $('#state').hidden=false; $('#live').hidden=true; $('#state').textContent='Live-Verbindung konnte nicht vorbereitet werden.'; });
