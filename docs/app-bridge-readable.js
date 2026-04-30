!function(){
const t=Symbol.for("RemoteUi::Retain"),n=Symbol.for("RemoteUi::Release"),e=Symbol.for("RemoteUi::RetainedBy");
class i{
constructor(){
this.memoryManaged=new Set}
add(n){
this.memoryManaged.add(n),n[e].add(this),n[t]()}
release(){
for(const t of this.memoryManaged)t[e].delete(this),t[n]();this.memoryManaged.clear()}}
function o(e){
return!!(e&&e[t]&&e[n])}
function r(t,{
deep:n=!0}={}){
return a(t,n,new Map)}
function a(n,e,i){
const r=i.get(n);
if(null!=r)return r;
const s=o(n);
if(s&&n[t](),i.set(n,s),e){
if(Array.isArray(n)){
const t=n.reduce((t,n)=>a(n,e,i)||t,s);
return i.set(n,t),t}
if(u(n)){
const t=Object.keys(n).reduce((t,o)=>a(n[o],e,i)||t,s);
return i.set(n,t),t}}
return i.set(n,s),s}
function s(t,{
deep:n=!0}={}){
return c(t,n,new Map)}
function c(t,e,i){
const r=i.get(t);
if(null!=r)return r;
const a=o(t);
if(a&&t[n](),i.set(t,a),e){
if(Array.isArray(t)){
const n=t.reduce((t,n)=>c(n,e,i)||t,a);
return i.set(t,n),n}
if(u(t)){
const n=Object.keys(t).reduce((n,o)=>c(t[o],e,i)||n,a);
return i.set(t,n),n}}
return a}
function u(t){
if(null==t||"object"!=typeof t)return!1;
const n=Object.getPrototypeOf(t);
return null==n||n===Object.prototype}
const l="_@f";
function d(r){
const a=new Map,s=new Map,c=new Map;
return{
encode:function t(n,e=new Map){
if(null==n)return[n];
const i=e.get(n);
if(i)return i;
if("object"==typeof n){
if(Array.isArray(n)){
e.set(n,[void 0]);
const i=[],o=[n.map(n=>{
const[o,r=[]]=t(n,e);
return i.push(...r),o}),i];
return e.set(n,o),o}
if(u(n)){
e.set(n,[void 0]);
const i=[],o=[Object.keys(n).reduce((o,r)=>{
const[a,s=[]]=t(n[r],e);
return i.push(...s),{...o,[r]:a}},{}),i];
return e.set(n,o),o}}
if("function"==typeof n){
if(a.has(n)){
const t=a.get(n),i=[{[l]:t}];
return e.set(n,i),i}
const t=r.uuid();a.set(n,t),s.set(t,n);
const i=[{[l]:t}];
return e.set(n,i),i}
const o=[n];
return e.set(n,o),o},decode:d,async call(t,n){
const r=new i,a=s.get(t);
if(null==a)throw Error("You attempted to call a function that was already released.");
try{
const t=o(a)?[r,...a[e]]:[r];
return await a(...d(n,t))}
finally{
r.release()}},release(t){
const n=s.get(t);n&&(s.delete(t),a.delete(n))},terminate(){
a.clear(),s.clear(),c.clear()}};
function d(i,o){
if("object"==typeof i){
if(null==i)return i;
if(Array.isArray(i))return i.map(t=>d(t,o));
if(l in i){
const a=i[l];
if(c.has(a))return c.get(a);
let s=0,u=!1;
const d=()=>{
s-=1,0===s&&(u=!0,c.delete(a),r.release(a))},f=()=>{
s+=1},h=new Set(o),p=(...t)=>{
if(u)throw Error("You attempted to call a function that was already released.");
if(!c.has(a))throw Error("You attempted to call a function that was already revoked.");
return r.call(a,t)};Object.defineProperties(p,{[n]:{
value:d,writable:!1},[t]:{
value:f,writable:!1},[e]:{
value:h,writable:!1}});
for(const t of h)t.add(p);
return c.set(a,p),p}
if(u(i))return Object.keys(i).reduce((t,n)=>({...t,[n]:d(i[n],o)}),{})}
return i}}
class f extends Error{
constructor(t){
const{
callId:n,error:e,result:i}=t;super(`No resolver found for call ID: ${
n}${
e?" Error: "+e:""}${
null==i?"":" Result: "+JSON.stringify(i)}`),this.callId=void 0,this.error=void 0,this.result=void 0,this.groupingHash="RemoteUI::MissingResolverError",this.name="MissingResolverError",this.callId=n,this.error=e,this.result=i}}
function h(){
return`${
p()}-${
p()}-${
p()}-${
p()}`}
function p(){
return Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)}
function m(t){
return t.toLowerCase().replace(/-+(.)/g,(t,n)=>n.toUpperCase())}
function w(t,n){
if(n)for(let e in n){
const i=n[e];null!=i&&""!==i&&(t[e]=i)}}
function b(t,n){
customElements.get(t)||customElements.define(t,n)}
const y=globalThis.HTMLElement??class{};
class v extends y{
constructor(){
super(),this.attachShadow({
mode:"open"}).innerHTML="<style>:host{
display: none;}</style><slot></slot>"}}
function g(t){
return t.replace(/-([a-z])/gi,(t,n)=>n.toUpperCase())}
function A(t){
try{
return navigator.userAgent.toLowerCase().includes(t.toLowerCase())}
catch(n){
return!1}}
function E(){
return A("Unframed")&&"MobileWebView"in window}
function k(){
return A("Shopify Mobile")}
function P(){
return A("Extensibility")}
function C(){
return A("Shopify POS")}
const S="app-iframe",T=/frame:\/*([^/]+)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/,L=(()=>{
const[,t,n,e]=window.name.match(T)??[];
return{
apiKey:t,scope:n,mode:e}})(),I=window.name.startsWith(S)||"main"===L.scope,O="modal"===L.scope,M=["hmac","locale","protocol","session","id_token","shop","timestamp","host","embedded","appLoadId","link_source"];
function x(t){
const n=new URL(t);
return M.forEach(t=>n.searchParams.delete(t)),n}
const R=["FailedAuthentication","InvalidAction","InvalidActionType","InvalidOptions","InvalidOrigin","InvalidPayload","Network","Permission","Persistence","UnexpectedAction","UnsupportedOperation"];
function $(t,n,e){
R.forEach(i=>{
t.subscribe("Error."+i,n,e)})}
function _(){
let t,n=!1;
const e=new Promise(n=>{
t=n});
return{
get promise(){
return e},resolve(e){
n=!0,t(e)},get resolved(){
return n}}}
function F(){
let t=Promise.resolve();
const n={};
return{
get promise(){
return t},has:t=>!!n[t],add(e){
const i=_();n[e]=i,t=t.then(()=>i.promise)},resolve(t){
const e=n[t];e&&(e.resolve(null),delete n[t])},isResolved(t){
const e=n[t];
return!e||e.resolved}}}
function U({
keys:t,held:n,handler:e,keyEvent:i="keydown"}){
let o=[];
const r=i=>{
t.flat().includes(i.key)?(o.push(i.key),(e=>{
const i=t.every(t=>o.includes(t)),r=!n||((t,n)=>n.some(n=>t.getModifierState(n)))(e,n);
return i&&r})(i)&&!a()&&e(i)):s()},a=()=>{
const t=document.activeElement;
return null!=t&&null!=t.nodeName&&("INPUT"===t.nodeName||"SELECT"===t.nodeName||"TEXTAREA"===t.nodeName||t.hasAttribute("contenteditable"))},s=()=>{
o=[]};
return document.addEventListener(i,r,{
capture:!0}),()=>{
document.removeEventListener(i,r,{
capture:!0})}}
function B(){
const t=window.shopify.config.host;
return"https://"+atob(t)}
const N=Symbol(),j=Symbol(),D=Symbol(),q=Symbol(),W="data-save-bar",V="data-discard-confirmation",z="ui-save-bar",G="update";
function H(t,{
onChange:n,filter:e=()=>!0}){
function i(){
const i=tt(t).filter(t=>J(t)&&e(t));
let o=!1,r=!1;
for(const t of i)if(o=[].some.call(t.elements,Y),o)break;
for(const t of i)if(r=t.hasAttribute(V),r)break;
const a=o?{
discardConfirmation:r,saveButton:{
onAction:()=>function(t){
for(const n of tt(t))J(n)&&Q(n)}(t)},discardButton:{
onAction:()=>function(t){
for(const n of tt(t))J(n)&&Z(n)}(t)}}:void 0;n(a)}
function o(t){
const n="target"in t?t.target:t;n&&(n[N]||("values"in n&&(n[D]=n.values),"value"in n&&("defaultValue"in n&&(n.defaultValue=n.value),n[j]=n.value),"checked"in n&&(n[q]=n.checked)))}
function r(t){
const n=t.target;n&&(n[N]=!0,i())}
function a(t){
const n=t.target;
if(J(n)){
for(const t of n.elements)t[N]=!1,o(t);i()}}
function s(t){
const n=t.target;
if(J(n)){
for(const t of n.elements){
if(D in t&&"values"in t&&(t.values=t[D]),j in t){
const n=Object.getOwnPropertyDescriptor(t.constructor.prototype,"value");n&&n.set?n.set.call(t,t[j]):t.value=t[j]}
q in t&&(t.checked=t[q]),t[N]=!1,o(t),X(t),t[N]=!1}
i()}}
i();
const c=new MutationObserver(t=>{
for(const n of t)if(n.attributeName&&"form"===n.target.nodeName.toLowerCase())return i()});
return c.observe(t,{
subtree:!0,childList:!0,attributes:!0,attributeFilter:[W,V]}),t.addEventListener("focusin",o),t.addEventListener("beforeinput",o),t.addEventListener("change",r),t.addEventListener("input",r),t.addEventListener("submit",a),t.addEventListener("reset",s),{
onChange:i,unobserve:()=>{
c.disconnect(),t.removeEventListener("focusin",o),t.removeEventListener("beforeinput",o),t.removeEventListener("change",r),t.removeEventListener("input",r),t.removeEventListener("submit",a),t.removeEventListener("reset",s)}}}
function K(t,{
onChange:n,filter:e=()=>!0}){
function i(){
const i=Array.from(t.querySelectorAll(z)).filter(t=>e(t)&&t.showing),o=i.length>0?i[i.length-1]:void 0,r=o?{
discardConfirmation:o.discardConfirmation,saveButton:{
loading:o.saveButton?.loading,disabled:o.saveButton?.disabled,onAction:o.saveButton?.onAction},discardButton:{
loading:o.discardButton?.loading,disabled:o.discardButton?.disabled,onAction:o.discardButton?.onAction}}:void 0;n(r)}
function o(t){
var n;(n=t.target)&&(n instanceof Element||n instanceof nt(n).Element)&&n.nodeName.toLowerCase()===z&&(t.stopPropagation(),i())}
return t.addEventListener(G,o),{
onChange:i,unobserve:()=>{
t.removeEventListener(G,o)}}}
function X(t){!("type"in t)||"radio"!==t.type&&"checkbox"!==t.type||t.dispatchEvent(new Event("click",{
bubbles:!0})),t.dispatchEvent(new InputEvent("input",{
bubbles:!0,inputType:"reset"})),t.dispatchEvent(new Event("change",{
bubbles:!0}))}
function J(t){
return!!t&&(t instanceof Element||t instanceof nt(t).Element)&&"form"===t.nodeName.toLowerCase()&&t.hasAttribute(W)}
function Y(t){
return!0===t[N]&&("value"in t&&t.value!==(t[j]??t.defaultValue)||"values"in t&&t.values!==(t[D]??t.defaultValue)||"checked"in t&&t.checked!==(t[q]??t.defaultChecked))}
function Q(t){
if(t.requestSubmit)return t.requestSubmit();
const n=document.createElement("input");n.type="submit",n.hidden=!0,t.appendChild(n),n.click(),t.removeChild(n)}
function Z(t){
t.reset()}
function tt(t){
const n=Array.from(t.querySelectorAll("form"));
return(t instanceof HTMLFormElement||t instanceof nt(t).HTMLFormElement)&&n.push(t),n}
function nt(t){
return t&&t.ownerDocument?.defaultView||t.defaultView||window}
class et{
constructor(){
this.listeners=new Map}
addEventListener(t,n){
this.listeners.has(t)||this.listeners.set(t,new Set),this.listeners.get(t).add(n)}
removeEventListener(t,n){
this.listeners.has(t)&&this.listeners.get(t).delete(n)}
async dispatchEvent(t,n,e){
if(!this.listeners.has(t))return!0;r(n);
const i=new CustomEvent(t,{
detail:n}),o=Promise.all(Array.from(this.listeners.get(t)).map(t=>t(i))).finally(()=>s(n));
return!1!==e?.wait&&await o,!i.defaultPrevented}}
let it;
function ot(){
if(void 0===it)try{
it=new URLSearchParams(window?.location?.search).has("intent")}
catch{
it=!1}
return it||!1}
const rt=/\/app\-?bridge[/.-]/i,at="https://cdn.shopify.com/shopifycloud/app-bridge.js",st=("object"==typeof document?window.document.currentScript?.src:void 0)??at,ct=function(t){
try{
return new URL(t).origin}
catch(n){
return null}}(st)||"",ut={
apiKey:"",appOrigins:[],debug:{},disabledFeatures:[],experimentalFeatures:[],locale:"en-US",host:""},lt=new URL(/^https:\/\/cdn\.shopify(\.com|cdn\.net)$/.test(ct)?st:at).hostname;
function dt(t,n){
switch(t){
case"disabledFeatures":case"experimentalFeatures":case"appOrigins":return n?.split(",")?.map(t=>t.trim())??void 0;case"debug":return{
webVitals:n?.includes("web-vitals")};default:return n}}
const ft=["apiKey","shop"],ht=k()||C()?/(^admin\.shopify\.com|\.myshopify\.com|\.spin\.dev|admin\.shop\.dev|localhost|\.myshopify\.io)$/:/(^admin\.shopify\.com|\.spin\.dev|admin\.shop\.dev|localhost)$/,pt={
TITLE_BAR:"TITLEBAR",WEBVITALS:"WEB_VITALS"};
function mt(t,n){
const[e,...i]=t.split("."),o=wt(e);
let r="APP::"+(pt[o]??o);
for(const s of i)r+="::"+wt(s);
const a={
group:e,type:r};
return null!=n&&(a.payload=n),a}
function wt(t){
return t.replace(/([a-z])([A-Z])/g,"$1_$2").toUpperCase()}
const bt="_@s";
function yt(t){
const n=new Uint8Array(t.length);
for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);
return n.buffer}
const vt=globalThis.XMLHttpRequest;
function gt(t){
let n=null;
try{
n=URL.createObjectURL(t);
const e=new vt;
if(e.overrideMimeType("text/plain; charset=x-user-defined"),e.open("GET",n,!1),e.send(),200!==e.status)throw Error(e.status+"");
return e.responseText}
catch(e){
return console.warn("File encoding failed: "+e),""}
finally{
n&&URL.revokeObjectURL(n)}}
var At=0;
function Et(t){
return"__private_"+At+++"_"+t}
function kt(t,n){
if(!Object.prototype.hasOwnProperty.call(t,n))throw new TypeError("attempted to use private field on non-instance");
return t}
const Pt=Symbol();
function Ct(t,n,e){
const i=t[n];
return Object.defineProperty(t,n,{
enumerable:!0,configurable:!0,value:e,writable:!0}),e[Pt]=i,i}
function St(t,n){
const e=t[n][Pt];e&&Object.defineProperty(t,n,{
enumerable:!0,configurable:!0,value:e,writable:!0})}
async function Tt(t,n){
const e={
url:t.url,method:t.method,headers:[...t.headers],mode:t.mode,credentials:t.credentials,cache:t.cache,redirect:t.redirect,referrer:t.referrer,integrity:t.integrity,keepalive:t.keepalive};
return"GET"!==t.method&&"HEAD"!==t.method&&(t.body instanceof FormData?e.body=t.body:(e.body=await t.arrayBuffer(),n&&n.push(e.body))),e}
function Lt(t,n){
const e=t instanceof ArrayBuffer&&0===t.byteLength?null:t;
return new Response(e,n)}
const It=({
api:t,protocol:n,internalApiPromise:e})=>{
const i=self.fetch;async function o(t,n){
const e=new Headers(n.headers).get("Shopify-Challenge-Required");
return e&&t?.isChallengeUrl&&await t.isChallengeUrl(e)&&t?.startChallenge?{
verified:await t.startChallenge(e)}:{
verified:!1}}
Ct(globalThis,"fetch",async function(r,a){
const s=new Request(r instanceof Request?r.clone():r,a),{
appOrigins:c=[]}=t.config,u=new URL(s.url),l=u.protocol===location.protocol&&(u.hostname===location.hostname||u.hostname.endsWith("."+location.hostname))||c.includes(u.origin),d="cdn.shopify.com"===u.hostname,{
adminApi:f,trustChallenge:h,extensionOriginFetch:p}=await e||{};
if(!l&&!d&&"function"==typeof f?.shouldIntercept&&"function"==typeof f.fetch){
const t=Array.from(s.headers.entries()),n=await f.shouldIntercept(s.method,s.url,t);
if(n?.intercept){
const n={
method:s.method,url:s.url,headers:t,body:await s.text()??void 0},e=await f.fetch(n);
if(!h)return new Response(e.body,e);
const{
verified:i}=await o(h,e);
if(i){
const t=await f.fetch(n);
return new Response(t.body,t)}
return new Response(e.body,e)}}
const m=l&&!s.headers.has("Authorization");m&&s.headers.set("Authorization","Bearer "+await t.idToken()),l&&!s.headers.has("X-Requested-With")&&s.headers.set("X-Requested-With","XMLHttpRequest"),l&&!s.headers.has("Accept-Language")&&void 0!==t.config.locale&&s.headers.set("Accept-Language",t.config.locale);
const w=s.clone();
let b;
if(p?.fetch){
const t=await Tt(s),n=await p.fetch(t);b=Lt(n.body,n)}
else b=await i(s);
if(b.headers.get("X-Shopify-Retry-Invalid-Session-Request")&&m)if(w.headers.set("Authorization","Bearer "+await t.idToken()),p?.fetch){
const t=await Tt(w),n=await p.fetch(t);b=Lt(n.body,n)}
else b=await i(w);
const y=b.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
if(l&&y)return n.send("Navigation.redirect.remote",{
url:new URL(y,location.href).href}),new Promise(()=>{});
if(l){
const{
verified:t}=await o(h,b);
if(t)return await i(w)}
return b})},Ot=({
api:t,protocol:n,internalApiPromise:e})=>{
t.idToken=async function(){
const{
idToken:t}=await e||{};
return t?await t():new Promise(t=>{
n.subscribe("SessionToken.respond",({
sessionToken:n})=>{
t(n)},{
once:!0}),n.send("SessionToken.request")})}},Mt=Symbol();
class xt{
constructor(t,n,e,i){
this.action=t,this.type=n,this.data=e,this[Mt]=i}
finish(){
this[Mt]()}}
class Rt{
constructor(t){
this.complete=t}}
function $t(t){
return"object"!=typeof t||null===t?t:Array.isArray(t)?t.map(t=>$t(t)):Object.keys(t).reduce((n,e)=>{
const i=t[e];
return n[e]=$t(i),n},{})}
async function _t(t){
try{
const n="function"==typeof t?t():(await t)();
return await Promise.resolve(n)}
catch{}}
const Ft=["shopify:","app:","extension:"],Ut=[...Ft,"https:","http:"],Bt=["_self","_top","_parent","_blank"],Nt=["a","s-link","s-button","s-clickable"],jt=Symbol("SIMULATING_CLICK");
function Dt(t,n){
addEventListener("click",function e(i){
i.target===t&&(removeEventListener("click",e),i.defaultPrevented||n(i))})}
function qt(t,n=!0){
let e=new URL(t,location.href);
if(Ft.includes(e.protocol)){
const t=`${
e.host}${
e.pathname}${
e.search}`,n=t.startsWith("/")?t:"/"+t;e=new URL(`${
e.protocol}${
n}`)}
return n&&"app:"===e.protocol&&(e.host=location.host,e.protocol=location.protocol),e.origin===location.origin?(e.hash="",e):e}
function Wt(t,n,e){
const i=qt(t),o=[...Nt.map(t=>"ui-nav-menu > "+t),...Nt.map(t=>t)].join(",");
return Array.from(document.querySelectorAll(o)).filter(t=>{
const o=t.getAttribute("href"),r=t.getAttribute("target")??"_self",a=t.getAttribute("rel")??"";
return!(!o||!zt(i,qt(o))||n&&r!==n||e&&a!==e)})[0]}
function Vt(t){
return t.replace(/\/+$/g,"")}
function zt(t,n){
const e=x(t),i=x(n);
if(e.href===i.href)return!0;
if(e.protocol!==i.protocol||e.host!==i.host||Vt(e.pathname)!==Vt(i.pathname))return!1;
if(!e.search&&!i.search)return!0;
if(!e.search||!i.search)return!1;
const o=new URLSearchParams(e.search),r=new URLSearchParams(i.search),a=Array.from(o.entries()).sort(([t],[n])=>t.localeCompare(n)),s=Array.from(r.entries()).sort(([t],[n])=>t.localeCompare(n));
return a.length===s.length&&a.every(([t,n],e)=>t===s[e][0]&&n===s[e][1])}
const Gt=({
internalApiPromise:t,saveBarManager:n,rpcEventTarget:e})=>{
const i=new AbortController;async function o(e){
const{
navigation:i}=await t,o=new URL(e.detail.destination.url,location.href),r=`${
o.pathname}${
o.search}`;
if(n.isSaveBarVisible)return;
const a=qt(r);
if(zt(a,qt(location.href)))return;
const s=Wt(a,"_self"),{
pathname:c,search:u}=a;s?(s[jt]=!0,Dt(s,t=>{(function(t){
const n=t.getAttribute("href");
if(!n)return!1;
const e=qt(n),i=t.getAttribute("target")??"_self";
return e.origin===location.origin&&"_self"===i})(s)&&(t.preventDefault(),t.stopImmediatePropagation(),_t(()=>i?.navigate?.(`app:${
c}${
u}`)))}),s.click(),s[jt]=!1):await(i?.navigate?.(`app:${
c}${
u}`))}
e.addEventListener("navigate",o),i.signal.addEventListener("abort",()=>{
e.removeEventListener("navigate",o)}),addEventListener("beforeunload",()=>i.abort()),addEventListener("click",t=>{
if(t.target&&t.target[jt])return;
if(t.defaultPrevented)return;
const e=function(t){
if(!t)return;
let n=t;
for(;n;){
if(n instanceof Element&&Nt.includes(n.nodeName.toLowerCase())){
if(null==n.getAttribute("href")){
n=n.parentNode;continue}
return n}
n=n.parentNode}}(t.target),i=e?.getAttribute("href"),o=e?.getAttribute("target")??"_self",r=e?.getAttribute("rel")??void 0;
if(!e||!i)return;
const{
protocol:a}=qt(i);
if(Ut.includes(a)){
if(n.isSaveBarVisible)return t.preventDefault(),t.stopImmediatePropagation(),void u();
if(Ft.includes(a)&&c(i,o,r))return t.preventDefault(),void t.stopImmediatePropagation();Dt(e,t=>{
c(i,o,r)&&(t.preventDefault(),t.stopImmediatePropagation())})}},!0);
const r=self.open;Ct(self,"open",function(t,e,i){
const o=t?qt(t).protocol:void 0;
if(null==t||!o||!Ut.includes(o))return r.call(this,t,e,i);
if(n.isSaveBarVisible)return u(),null;
const a=Wt(t,e??"_blank",i);
if(a)return a.click(),null;
if(c(t,e??"_blank",i,!0))return null;
const s=qt(t);
return"shopify:"===s.protocol?r.call(this,`https://${
shopify.config.shop}${
s.pathname}${
s.search}${
s.hash}`,e,i):r.call(this,t,e,i)});
const a={
async pushState(n){
const{
navigation:e}=await t||{};
if(!e||!n)return;
const{
pathname:i,search:o}=qt(n);await(e?.navigate?.(`app:${
i}${
o}`,{
history:"push"}))},async replaceState(n){
const{
navigation:e}=await t||{};
if(!e||!n)return;
const{
pathname:i,search:o}=qt(n);await(e?.navigate?.(`app:${
i}${
o}`,{
history:"replace"}))}},s=history.replaceState;
function c(e,i,o="",a=!1){
let s=i;
const c=qt(e);
if(!Bt.includes(s)||!Ut.includes(c.protocol))return!1;
const l=`${
c.pathname}${
c.search}`;
if("shopify:"===c.protocol&&!l.startsWith("/admin/"))throw Error(`Invalid URL: expected '/admin/*', received: '${
l}'.`);switch("shopify:"===c.protocol&&"_self"===s&&(s="_top"),s){
case"_self":if(c.origin===location.origin)break;
return r.call(this,c,s,o),!0;case"_top":case"_parent":return n.isSaveBarVisible?(u(),!0):(_t(async()=>{
const{
navigation:n}=await t;n?.navigate?.(c.toString(),"shopify:"===c.protocol?void 0:"_top")}),!0);case"_blank":return!(a&&!/noopener/i.test(o)||(_t(async()=>{
const{
navigation:n}=await t;n?.navigate?.(c.toString(),s)}),0))}
return!1}
async function u(){
n.isSaveBarVisible&&await _t(async()=>{
const{
saveBar:n}=await t||{};await(n?.leaveConfirmation?.())})}
Ct(history,"pushState",function(t,n,e){
s.call(history,t,n,e),a.pushState(e)}),Ct(history,"replaceState",function(t,n,e){
s.call(history,t,n,e),a.replaceState(e)}),addEventListener("beforeunload",t=>{
n.isSaveBarVisible&&(t.preventDefault(),t.returnValue=!0)}),a.replaceState(location.href)},Ht=({
protocol:t,internalApiPromise:n})=>{
const e=new AbortController,i=self.navigation;
function o(n,e){
if(!n)return;
const i=x(new URL(n,location.href)),o=`${
i.pathname}${
i.search}${
i.hash}`;I&&t.send("Navigation.history."+e,{
path:o})}
if(i&&"navigate"in i){
i.navigate;
const n=Ct(i,"navigate",function(e,i){
const o=s(e);
return o?(t.send("Navigation.redirect.admin.path",{
path:o}),{
committed:new Promise(()=>{}),finished:new Promise(()=>{})}):n.call(this,e,i)});e.signal.addEventListener("abort",()=>{
St(i,"navigate")})}
if(i&&"oncurrententrychange"in i)i.addEventListener("currententrychange",t=>{
t.from?.url!==i.currentEntry?.url&&o(location.href,"replace")},{
signal:e.signal});else{
const t=history.pushState;Ct(history,"pushState",function(n,e,i){
const r=location.href;t.call(this,n,e,i),i&&new URL(i,r).href!==r&&o(i,"replace")}),e.signal.addEventListener("abort",()=>{
St(history,"pushState")});
const n=history.replaceState;Ct(history,"replaceState",function(t,e,i){
const r=location.href;n.call(this,t,e,i),i&&new URL(i,r).href!==r&&o(i,"replace")}),e.signal.addEventListener("abort",()=>{
St(history,"replaceState")}),addEventListener("popstate",()=>{
o(location.href,"replace")},{
signal:e.signal})}
const r=self.open;Ct(self,"open",function(e,i,o){
if(null==e)return r.call(this,e,i,o);
const a=function(t){
const n=new URL(t,location.href);
return"app:"===n.protocol?new URL(n.href.replace(/^app:\/{0,2}/,""),location.href).href:n.href}(e);
if("extension:"===new URL(a).protocol)return void(async()=>{
const{
navigation:t}=await n||{};
if("function"!=typeof t?.navigate)throw Error("Missing navigation API");t.navigate(a)})();i=(i||"")+"",o=(o||"")+"";
const c=s(a);
if(c)return t.send("Navigation.redirect.admin.path",{
path:c,newContext:""===i||"_blank"===i}),null;switch(i){
case"_self":break;case"_top":case"_parent":return t.send("Navigation.redirect.remote",{
url:a}),top;case"_modal":throw Error("_modal is not yet implemented");case"":case"_blank":if(!/noopener/i.test(o)&&!k()&&!C())break;
return t.send("Navigation.redirect.remote",{
url:a,newContext:!0}),null}
return r.call(this,a,i,o)}),e.signal.addEventListener("abort",()=>{
St(self,"open")}),addEventListener("click",t=>{
let n=t.target;
for(;n;){
if(n instanceof Element&&["A","S-LINK","S-BUTTON","S-CLICKABLE"].includes(n.nodeName)){
const e=n.getAttribute("href");
if(null==e){
n=n.parentNode;continue}
const i=new URL(e,location.href),o=i.protocol;
if("shopify:"===o||"app:"===o||"extension:"===o){
t.preventDefault();
const o=n.getAttribute("target")||void 0,r=n.getAttribute("rel")||void 0;
if(navigator.userAgent.includes("Shopify Mobile/iOS")&&navigator.userAgent.includes("Unframed")){
const t=i.href.replace(/shopify:\/*admin/,"https://"+atob(shopify.config.host||""));
return void open(t,o,r)}
return void open(e,o,r)}}
n=n.parentNode}},{
signal:e.signal}),o(location.href,"replace");
const a=/^shopify:\/*admin\//i;
function s(t){
const n=x(new URL(t)).href;
if(a.test(n))return n.replace(a,"/")}
return()=>{
e.abort()}},Kt=t=>t.toString(16),Xt=`${
Kt(Date.now())}-${
Kt(1e9*Math.random()|0)}-`;
let Jt=0;
function Yt(){
return Xt+Kt(++Jt)}
const Qt=new Set(["product","variant","collection"]),Zt={
query:"",selectionIds:[],action:"add",multiple:!1,filter:{
hidden:!0,variants:!0,draft:void 0,archived:void 0,query:void 0}};
var tn=(t=>(t[t.ELEMENT_NODE=1]="ELEMENT_NODE",t[t.ATTRIBUTE_NODE=2]="ATTRIBUTE_NODE",t[t.TEXT_NODE=3]="TEXT_NODE",t[t.COMMENT_NODE=8]="COMMENT_NODE",t))(tn||{});
const nn={
oneOf(t,{
caseInsensitive:n=!0}={}){
n&&(t=t.map(t=>t.toLowerCase()));
const e=new Set(t);
return t=>(n&&(t=t?.toLowerCase()),e.has(t))},anyString:()=>t=>"string"==typeof t,flag:()=>t=>null!=t&&0===t.length},en={
anyText:{
type:3},anyElement:{
type:1}};
function on(t){
return`<${
t.localName}>`}
function rn(t,n){
return!(n.type&&n.type!==t.nodeType||n.name&&n.name!==t.localName)}
function an(t,n){
if(n.type&&n.type!==t.nodeType||n.name&&n.name!==t.localName)throw Error("Unexpected tag "+t.outerHTML);
const{
attributes:e,children:i}=n;
if(e)if(1===t.nodeType)n.attributes&&function(t,n={}){
const e=Object.entries(n),i=new Set(t.getAttributeNames().map(t=>t.toLowerCase()));
for(const[r,a]of e){
const n=r.toLowerCase();i.delete(n)?a.value&&(sn(a.value)(t.getAttribute(n)?.toLowerCase()??null,n,t)||console.error(`Unexpected value for attribute "${
n}" on ${
on(t)}`)):a.required&&console.error(`Missing attribute "${
n}" on ${
on(t)}`)}
const o=Array.from(i).filter(t=>!t.startsWith("data-"));0!==o.length&&console.error(`Unexpected attributes on ${
on(t)}: ${
o}`)}(t,e);else if(3===t.nodeType&&e.data?.value&&!sn(e.data.value)(t.data,"data",t))throw Error("Unexpected text");
if(i)for(const o of t.childNodes){
if(8===o.nodeType)continue;
if(3===o.nodeType&&0===o.data.trim().length)continue;
const n=i.find(t=>rn(o,t));
if(!n)throw Error(`Unexpected tag <${
o.outerHTML}> in ${
on(t)}`);an(o,n)}}
function sn(t){
return"function"==typeof t?t:t instanceof RegExp?n=>(t.lastIndex=0,t.test(n??"")):n=>t===n}
const cn={
value:nn.anyString()},un={
id:cn,name:cn,class:cn,rel:cn,onclick:cn},ln={...un,type:cn,value:cn},dn={...un,active:cn,href:cn,target:cn};
function fn(t){
const n={
name:t,attributes:{},children:[{
name:"a",attributes:dn,children:[en.anyText]},{
name:"s-link",attributes:dn,children:[en.anyText]}]};
return({
protocol:e,internalApiPromise:i})=>{
async function o(){
const{
navigation:t}=await i||{};
return!(2!==t?.version)}
let r;
function a(){
r||(r=setTimeout(s,0))}
async function s(){
clearTimeout(r),r=0;
const n=Array.from(document.querySelectorAll(t)).reverse()[0],{
navMenu:a}=await i||{};
if(n&&"function"==typeof a?.set){
const t=n.anchors.filter(t=>!n.isHomeAnchor(t)).map(t=>{
const{
pathname:n,search:e,textContent:i,rel:o}=t;
return{
label:i??"",url:new URL(n+e,location.href).toString(),rel:o||void 0}});
if(a.set(t),await o())return}
const s=await c;
if(!s)return void console.warn(t+" cannot be used in modal context");
const u=document.querySelectorAll("s-app-nav, ui-nav-menu");u.length>1&&console.warn(`Multiple navigation menu elements detected (${
u.length} total). Only one <s-app-nav> or <ui-nav-menu> should be used per page. Found: ${
Array.from(u).map(t=>t.tagName.toLowerCase()).join(", ")}`);
const l={
items:Array.from(document.querySelectorAll(t)).flatMap(t=>t.menuItems())};e.send(`Menu.${
s}_Menu.UPDATE`,l)}
const c=new Promise(t=>{
e.subscribe("getState",({
features:n})=>{
const e=n?.Menu||{},{
Dispatch:i}=e["APP::MENU::NAVIGATION_MENU::UPDATE"]||{},{
Dispatch:o}=e["APP::MENU::CHANNEL_MENU::UPDATE"]||{};t(o?"channel":i?"navigation":void 0)},{
once:!0})}),u=new WeakMap;
function l(t,n){
if(n&&n.homeAnchor===t)return null;
if(!n&&t.getAttribute&&"home"===t.getAttribute("rel"))return null;
if(!u.has(t)){
const n="href"in t?btoa(t.href):Yt();u.set(t,n)}
return u.get(t)}
b(t,class extends v{
get anchors(){
const t=[];
return Array.from(this.children).forEach(n=>{
if("A"===n.tagName)t.push(n);else if("S-LINK"===n.tagName){
const e=n,i=e.getAttribute("href");
if(!i)return;
const o=new URL(i,location.href),r={
href:o.href,pathname:o.pathname,search:o.search,textContent:e.textContent,rel:e.getAttribute("rel"),protocol:o.protocol,hasAttribute:t=>e.hasAttribute(t),getAttribute:t=>e.getAttribute(t),click:()=>{
const t=new MouseEvent("click",{
bubbles:!0,cancelable:!0});e.dispatchEvent(t)}};t.push(r)}}),t}
get homeAnchor(){
return this.anchors.find(t=>((t.rel||"")+"").includes("home"))}
isHomeAnchor(t){
return((t.rel||"")+"").includes("home")}
connectedCallback(){
this.t=new AbortController;
const t={
signal:this.t.signal};_t(async()=>{
await o()||(e.subscribe("Navigation.redirect.app",t=>this.i(t),t),addEventListener("popstate",()=>this.o(),t))}),addEventListener("beforeunload",()=>this.u(),t),this.l=new MutationObserver(()=>this.o()),this.l.observe(this,{
childList:!0,subtree:!0,attributes:!0,characterData:!0}),this.o()}
async i(t){
if(!this.t)return;
const{
pathname:n,href:o}=x(new URL(t.path,location.href));
if(o===x(location.href).href)return;
const r=t=>{
for(const[n,e]of this.h())if(e.destination.path===t)return n},a=this.homeAnchor,c=r(t.path)??r(n)??a;
if(c){
let t=function(t){
n=t.defaultPrevented,t.preventDefault()};
if("http:"!==c.protocol&&"https:"!==c.protocol||new URL("",c.href).href===new URL("",location.href).href)return c.click(),void s();
let n=!1;
if(addEventListener("click",t),c.click(),removeEventListener("click",t),n)return void s()}
c&&s();
const{
navigation:u}=await i||{};
if(u?.navigate&&"function"==typeof u.navigate){
const n=new URL(t.path,location.href);u.navigate(`app:/${
n.pathname}${
n.search}`)}
else{
this.u();
const n=`${
t.path}${
t.path.includes("?")?"&=":"?="}`;e.send("Navigation.redirect.app",{
path:n})}}
o(){
an(this,n),a()}
u(){
this.t?.abort(),this.t=void 0,this.l?.disconnect(),this.l=void 0}
disconnectedCallback(){
this.u(),a()}*h(t=!1){
const n=this.anchors;
for(const e of n){
const n=e.textContent??"",i=e.pathname+e.search;t===this.isHomeAnchor(e)&&(yield[e,{
id:l(e,this),destination:{
path:i},label:n,redirectType:"APP::NAVIGATION::REDIRECT::APP"}])}}
menuItems(t=!1){
return Array.from(this.h(t)).map(([,t])=>t)}
selectedMenuItemId(){
const t=this.anchors.filter(t=>!this.isHomeAnchor(t));
let n=t.find(t=>t.hasAttribute("active"));
if(!n){
const e=x(location.href);e.hash="",n=t.find(t=>t.href===e.href)}
return n?l(n,this):null}})}}
const hn=fn("s-app-nav"),pn=z,mn=[{
name:"button",attributes:{...ln,variant:{
value:nn.oneOf(["primary"])},disabled:{
value:nn.flag()},loading:{
value:nn.flag()}},children:[en.anyText]}],wn={
name:"ui-save-bar",attributes:{
id:{
value:nn.anyString()},discardConfirmation:{
value:nn.flag()}},children:[...mn]};
function bn(t){
if(t)return{
disabled:t.disabled,loading:t.hasAttribute("loading"),onAction(){
t.click()}}}
function yn(t){
const n=document.documentElement?.getElementsByTagName?.(pn)?.[t];
if(!n)throw Error(`SaveBar with ID ${
t} not found`);
return n}
const vn=':scope > s-button[slot="breadcrumb-actions"], :scope > s-link[slot="breadcrumb-actions"]',gn=':scope > s-button[slot="primary-action"], :scope > s-link[slot="primary-action"]',An=':scope > s-button[slot="secondary-actions"], :scope > s-link[slot="secondary-actions"] , :scope > s-button-group[slot="secondary-actions"]',En=Symbol("s-page-element-id");
function kn(t={}){
const{
hideElements:n=!1,context:e=document}=t,i=e.querySelector("s-page");
if(!i)return null;
const o={
title:i.getAttribute("heading")||void 0},r=i.querySelector(vn);r&&(o.breadcrumb=r,n&&(r.style.display="none"));
const a=i.querySelector(gn);a&&(o.primaryAction=a,n&&(a.style.display="none"));
const s=Array.from(i.querySelectorAll(An));s.length>0&&(o.secondaryActions=s,n&&s.forEach(t=>{
t.style.display="none"}));
const c=i.querySelector('[slot="accessory"]');
if(c){
const t=c.textContent?.trim();t&&(o.accessory={
type:"badge",content:t,tone:c.getAttribute("tone")||void 0},n&&(c.style.display="none"))}
return o}
function Pn(t){
t[En]||(t[En]=Yt());
const n=t[En],e=t.textContent??"",i=t.getAttribute("icon")||void 0,o=t.getAttribute("tone")||void 0,r=t.getAttribute("accessibilityLabel")||void 0;
return{
id:n,label:e,...i&&{
icon:i},...o&&{
tone:o},...r&&{
accessibilityLabel:r},disabled:t.disabled||!1,loading:t.hasAttribute("loading")}}
function Cn(t,n={}){
const{
hideElements:e=!1,context:i=document}=n;
return t.map(t=>{
if("S-BUTTON-GROUP"===t.tagName){
const n=Array.from(t.querySelectorAll("s-button")).map(t=>(t[En]||(t[En]=Yt()),{
id:t[En],label:t.textContent??"",icon:t.getAttribute("icon")||void 0,accessibilityLabel:t.getAttribute("accessibilityLabel")||void 0,disabled:t.disabled||!1,loading:t.hasAttribute("loading")}));
return t[En]||(t[En]=Yt()),{
id:t[En],label:t.getAttribute("label")||"Button Group",icon:t.getAttribute("icon")||void 0,buttons:n,groupType:"inline"}}
if("S-BUTTON"===t.tagName){
const n=t.getAttribute("commandfor");
if(n){
const o=i.querySelector("#"+CSS.escape(n));
if(o&&("S-MENU"===o.tagName||"S-BUTTON-GROUP"===o.tagName))return o.classList.toggle("title-bar-menu",!0),e&&"S-MENU"===o.tagName&&(o.style.display="none"),function(t,n){
n[En]||(n[En]=Yt());
const e=n[En],i=t.textContent??"Actions",o=t.getAttribute("icon")||void 0,r="S-MENU"===n.tagName?"menu":"S-BUTTON-GROUP"===n.tagName?"inline":void 0;
return{
id:e,label:i,icon:o,buttons:Array.from(n.querySelectorAll("s-button")).map(t=>(t[En]||(t[En]=Yt()),{
id:t[En],label:t.textContent??"",icon:t.getAttribute("icon")||void 0,accessibilityLabel:t.getAttribute("accessibilityLabel")||void 0,disabled:t.disabled||!1,loading:t.hasAttribute("loading"),tone:t.getAttribute("tone")||void 0})),groupType:r}}(t,o)}}
return Pn(t)})}
function Sn(t,n){
return t[En]||(t[En]=n||Yt()),t[En]}
function Tn(t){
return t&&("accessory"===t.getAttribute("slot")||"S-BUTTON"===t.tagName||"S-LINK"===t.tagName)}
function Ln(t){
for(let n=0;n<t.length;n++){
const e=t[n];
if(1===e.nodeType&&Tn(e))return!0}
return!1}
const In="ui-title-bar",On=[{
name:"button",attributes:{...ln,variant:{
value:nn.oneOf(["breadcrumb","primary"])},tone:{
value:nn.oneOf(["critical","default"])},disabled:{
value:nn.flag()},loading:{
value:nn.flag()}},children:[en.anyText]},{
name:"a",attributes:{...dn,variant:{
value:nn.oneOf(["breadcrumb","primary"])}},children:[en.anyText]}],Mn={
name:"section",attributes:{
label:cn},children:[{
name:"button",attributes:ln,children:[en.anyText]},{
name:"a",attributes:dn,children:[en.anyText]}]};Mn.children.push(Mn);
const xn={
name:"ui-title-bar",attributes:{
title:cn},children:[...On,Mn]},Rn=vn,$n=gn,_n=An;
function Fn(t){
t[En]||(t[En]=Yt());
const n=t[En],e=t.textContent??"",i=t.getAttribute("icon")||void 0,o=t.getAttribute("tone")||void 0;
return{
id:n,label:e,...i&&{
icon:i},...o&&{
tone:o},disabled:t.disabled,loading:t.hasAttribute("loading")}}
function Un(t){
return null!=t&&(Bn(t)||Un(t.parentNode))}
function Bn(t){
return"TITLE"===t.nodeName}
const Nn=["small","base","large","max"];
function jn(t,n){
const e="app-window"===n?.variantLock,i={
id:{
value:nn.anyString()},src:{
value:nn.anyString()}};e||(i.variant={
value:nn.oneOf(["small","base","large","max"])});
const o={
name:t,attributes:i,children:e?[]:[xn,wn,en.anyElement]};
return({
api:n,internalApiPromise:i,saveBarManager:r})=>{
const a={
classic:F(),max:F(),"app-window":F()};
function s(n){
const e=document.documentElement?.getElementsByTagName?.(t)?.[n];
if(!e)throw Error(`Modal with ID ${
n} not found`);
return e}
n.modal={
show:async t=>s(t).show(),hide:async t=>s(t).hide(),toggle:async t=>s(t).toggle()},function(t){
document.addEventListener("click",async n=>{
const e=n.target;
if(!e)return;
let i=e;
for(;i&&i!==document.body;){
const e=i.getAttribute("command"),o=i.getAttribute("commandFor");
if(e&&o){
const i=document.getElementById(o);
if(i&&i.tagName.toLowerCase()===t.toLowerCase()){
switch(n.preventDefault(),e.startsWith("--")?e.slice(2):e){
case"show":await i.show();break;case"hide":await i.hide();break;case"toggle":await i.toggle()}
break}}
i=i.parentElement}})}(t),b(t,class extends v{
constructor(){
super(...arguments),this.p=Yt(),this.m=!1,this.v=!1,this.A=[]}
static get observedAttributes(){
return e?["src"]:["variant","src"]}
get variant(){
if(e)return"app-window";
const t=this.getAttribute("variant")??"";
return Nn.includes(t)?t:"base"}
set variant(t){
e||this.setAttribute("variant",t)}
get content(){
return this.src?void 0:this.k}
set content(t){
t!==this.k&&(this.P?.unobserve(),this.P=void 0,this.C?.unobserve(),this.C=void 0,this.S?.unobserve(),this.S=void 0,this.T?.unobserve(),this.T=void 0,this.k=t,t&&(this.P=function(t){
function n(t){
let n=t.target;
for(;n;){
if("A"===n.nodeName&&n.hasAttribute("href")){
const e=n.getAttribute("href"),i=n.getAttribute("target")||void 0,o=n.getAttribute("rel")||void 0;
if(null==e){
n=n.parentNode;continue}
t.preventDefault(),window.open(e,i,o);break}
n=n.parentNode}}
return t.addEventListener("click",n),{
unobserve:()=>t.removeEventListener("click",n)}}(t),this.S=H(t,{
onChange:t=>{"app-window"===this.L||("max"===this.L?r.set({
maxModalFromForm:t}):r.set({
classicModalFromForm:t}))},filter:()=>!!this.L}),this.T=K(this,{
onChange:t=>{"app-window"===this.L||("max"===this.L?r.set({
maxModalFromCustomElement:t}):r.set({
classicModalFromCustomElement:t}))},filter:()=>!!this.L})))}
get src(){
return this.getAttribute("src")??void 0}
set src(t){
t?this.setAttribute("src",t):this.removeAttribute("src")}
get contentWindow(){
if(this.src)return this.I}
get I(){
const t=this.O;
if(t)return function(t){
try{
const n=window.parent?.frames[t];
if(n.fetch)return n}
catch{
return}}(t)}
connectedCallback(){
this.l=new MutationObserver(()=>this.o()),this.l.observe(this,{
attributes:!0,childList:!0,subtree:!0}),this.o(),this.querySelector("ui-title-bar")?.addEventListener("change",()=>this.o())}
disconnectedCallback(){
this.l?.disconnect(),this.M()}
setAttribute(t,n){
super.setAttribute(t,n),this.o()}
removeAttribute(t){
super.removeAttribute(t),this.o()}
async show(){
if(!this.R&&(await this.o(),!this.R))return;
if(this.L)return;
const t="app-window"===this.R.variant||"max"===this.R.variant?this.R.variant:"classic";this.L=t;
const n=a[t];
if(n.has(this.p))return;
const e=n.promise;
if(n.add(this.p),await e,n.isResolved(this.p))return;this.m=!0;
const o=await i;
if(!o)throw Error("Cannot show modal");
const r=this.$();
if(!o.modal?.show||"function"!=typeof o.modal.show)throw Error("Modal API is not available");this.O=await o.modal.show(this.p),r(),this.I&&(this.I.shopify=window.shopify,this.I.polaris=window.polaris,this.I.close=()=>this.hide(),this.I.shopify=window.shopify),this._(),this.v||(this.F(),this.v=!0),this.dispatchEvent(new CustomEvent("show")),this.I?.focus(),this.C?.onChange(),this.S?.onChange(),this.T?.onChange()}
async hide(){
const t=this.L;
if(!t)return;
if(a[t].resolve(this.p),!this.m)return;this.v&&(this.U(),this.v=!1),this.B&&(this.B.disconnect(),this.B=void 0),void 0!==this.N&&(clearTimeout(this.N),this.N=void 0);
const n=await i;n?.modal?.hide&&"function"==typeof n.modal.hide&&await n.modal.hide(this.p),this.m=!1,this.L=void 0,this.O=void 0,this.dispatchEvent(new CustomEvent("hide")),this.C?.onChange(),this.S?.onChange(),this.T?.onChange()}
async toggle(){
this.R||await this.o(),this.L?await this.hide():await this.show()}
async o(){
if(an(this,o),this.j(),!this.R)return;
const t=await i;t?.modal||location.reload(),t?.modal?.set&&"function"==typeof t.modal.set&&await t.modal.set(this.R,this.p)}$(){
let t;
const n=setInterval(()=>{
this.I&&(clearInterval(n),t=setTimeout(()=>{
console.warn("The modal src is missing App Bridge CDN script tag.")},1e4))},100);
return()=>{
clearInterval(n),clearTimeout(t)}}
async F(){
const{
content:t,I:n}=this;
if(!t||!n)return;
const e=Wn();qn(document,n.document,[e]);
const i=function(t,n,e="div"){
const i=t.querySelector("#"+n);
if(i)return i;
const o=nt(t).document.createElement(e);
return o.setAttribute("id",n),t.appendChild(o),o}(n.document.body,"modal-content-8885451e-38a1-4196-835b-40f3efb46c4e");i.replaceChildren(t);
const o=t.querySelector("[autofocus]");o instanceof HTMLElement&&setTimeout(()=>{
o.focus()},100)}
U(){
const{
content:t}=this;t&&this.appendChild(t)}_(){
const{
I:t}=this;
if(t&&e){
this.C=H(t.document,{
onChange:t=>{
r.set({
appWindowFromForm:t})}});
try{
const n=t.document.createElement("style");n.textContent='\n            s-page > s-button[slot="primary-action"],\n            s-page > s-button[slot="secondary-actions"],\n            s-page > [slot="accessory"],\n            .title-bar-menu,\n            s-app-nav,\n            ui-nav-menu {\n              display: none !important;\n            }\n          ';
const e=t.document.head||t.document.documentElement;e?.appendChild(n)}
catch(n){
console.debug("Could not inject early styles to hide slots:",n)}"complete"===t.document.readyState?this.D():t.addEventListener("load",()=>this.D(),{
once:!0})}}
j(){
let n,i,o=[];
if(!e){
const e=Array.from(this.childNodes).filter(t=>"ui-title-bar"!==t.nodeName.toLowerCase()&&t.nodeName.toLowerCase()!==pn.toLowerCase()&&t.nodeType===tn.ELEMENT_NODE);e.length>1&&console.warn(`Only one child element is allowed inside <${
t}>. The rest will be ignored.`),n=e.length?e[0]:this.k,this.content=n||document.createElement("div"),[i]=Array.from(this.getElementsByTagName("ui-title-bar")),o=i?Array.from(i?.getElementsByTagName("button")):[]}
const{
primaryButtonElement:r,secondaryButtonElement:a}=o.reduce((t,n)=>{
const e=n.getAttribute("variant");
return"primary"===e?t.primaryButtonElement=n:e||(t.secondaryButtonElement=n),t},{
primaryButtonElement:null,secondaryButtonElement:null}),s=this.src?new URL(this.src,location.href):void 0;
if(s&&s.origin!==location.origin)throw Error("Invalid modal src origin");
var c,u;this.R={
title:i?.getAttribute("title")||document.title,variant:(c=this.L,u=this.variant,"app-window"===c||"max"===c?c:u),src:s?.toString(),buttons:[r,a].map(t=>{
if(t)return{
id:Yt(),label:t.textContent??"",variant:t.getAttribute("variant")??void 0,tone:t.getAttribute("tone")??void 0,disabled:t.disabled,loading:t.hasAttribute("loading"),onAction(){
t.click()}}}).filter(Boolean),onClose:()=>this.hide()}}
async D(){
const{
I:t}=this;
if(!t)return;
const n=async()=>{
try{
const t=kn({
hideElements:!1,context:this.I.document});
if(t){
t.title&&this.R?this.R.title=t.title:this.R&&!this.R.title&&(this.R.title=document.title||void 0),this.R&&(this.R.accessory=t.accessory);
const n=[],e=(t,e)=>{
n.push({
id:Yt(),label:t.textContent??"",variant:e,icon:t.getAttribute("icon")??void 0,tone:t.getAttribute("tone")??void 0,disabled:t.disabled||!1,loading:t.hasAttribute("loading"),onAction:()=>{
t.click()}})};
if(this.A=[],t.primaryAction&&(e(t.primaryAction,"primary"),this.A.push(t.primaryAction)),t.secondaryActions){
const i=Cn(t.secondaryActions,{
hideElements:!1,context:this.I.document}),o=new Map;t.secondaryActions.forEach(t=>{
const n=Sn(t);o.set(n,t)}),i.forEach(t=>{
if("buttons"in t)n.push({
id:t.id,variant:"secondary",label:t.label,icon:t.icon,disabled:t.disabled,actions:t.buttons.map(t=>({
id:t.id,label:t.label,disabled:t.disabled,loading:t.loading,tone:t.tone,icon:t.icon,onAction:()=>{
const n=Array.from(this.I.document.querySelectorAll("s-menu s-button")).find(n=>Sn(n)===t.id);n?.click()}}))});else{
const n=o.get(t.id);n&&(e(n,"secondary"),this.A.push(n))}})}
n.length>0&&this.R&&(this.R.buttons=n)}
else this.R&&(this.R.title||(this.R.title=document.title||void 0));
if(this.R){
const t=await i;t?.modal?.set&&"function"==typeof t.modal.set&&await t.modal.set(this.R,this.p)}}
catch(t){
console.debug("Could not extract from s-page in iframe:",t)}};await n();
try{
const e=new MutationObserver(async t=>{
let e=!1;
for(const n of t){
if("attributes"===n.type){
const t=n.target;
if(Tn(t)||"S-PAGE"===t?.tagName){
e=!0;break}}
if("childList"===n.type&&(Tn(n.target)||Ln(n.addedNodes)||Ln(n.removedNodes))){
e=!0;break}
if("characterData"===n.type&&Tn(n.target.parentElement)){
e=!0;break}}
e&&(void 0!==this.N&&clearTimeout(this.N),this.N=window.setTimeout(async()=>{
await n(),this.N=void 0},16))}),i=t.document.querySelector("s-page")||t.document.body;e.observe(i,{
childList:!0,subtree:!0,attributes:!0,characterData:!0,attributeFilter:["heading","variant","tone","disabled","loading","slot","commandfor"]}),this.B=e}
catch(e){
console.debug("Could not observe iframe for s-page changes:",e)}}
async M(){
this.B&&(this.B.disconnect(),this.B=void 0),void 0!==this.N&&(clearTimeout(this.N),this.N=void 0);
const t=await i;t?.modal?.set&&"function"==typeof t.modal.set&&await t.modal.set(null,this.p)}})}}
function Dn(t){
return Array.from(t.styleSheets).map(t=>t.ownerNode).filter(t=>!(!t||function(t){
let n=t.parentNode;
for(;n;)switch(n.nodeName.toLowerCase()){
case"svg":return!0;case"body":return!1;default:n=n.parentNode}}(t)))}
async function qn(t,n,e=[]){
const i=[...Dn(t),...e],o=Dn(n);await Promise.all(i.filter(t=>!o.find(n=>n.isEqualNode(t))).map(t=>{
const e=t.cloneNode(!0);
return n.head.appendChild(e),new Promise(t=>{
e.addEventListener("load",t,!0)}).catch(()=>{})}))}
function Wn(){
const t=document.createElement("style"),n="modal-content-8885451e-38a1-4196-835b-40f3efb46c4e";
return t.textContent=`\n    html, body {\n      min-height: auto !important;\n      height: auto !important;\n      padding: 0 !important;\n      margin: 0 !important;\n      background-color: rgba(0, 0, 0, 0) !important;\n      display: block !important;\n    }\n    body > #${
n} {\n      display: flex !important;\n    }\n    body > #${
n} > * {\n      width: 100%;\n    }\n  `,t}
function Vn(t){
try{
const n=window.parent?.frames[t];
if(n.fetch)return n}
catch{
return}}
function zn(t){
const n=t.nodeName.toLowerCase();
return"ui-modal"===n||"s-frame"===n}
function Gn(t){
let n=t.parentNode;
for(;n;){
if(zn(n))return n;
if("body"===n.nodeName.toLowerCase())break;n=n.parentNode}}
const Hn=jn("s-app-window",{
variantLock:"app-window"}),Kn="APP::SCANNER::OPEN::CAMERA";
function Xn(t){
const n=t?.Scanner||{},{
Dispatch:e}=n[Kn]||{};
return!!e}
let Jn=!1;
const Yn=[{
keys:["k"],held:["Meta","Control"]},{
keys:["."],held:["Meta","Control"]}],Qn={
duration:5e3},Zn=jn("ui-modal"),te=fn("ui-nav-menu"),ne=[{
fn:"onTTFB",name:"TimeToFirstByte"},{
fn:"onFCP",name:"FirstContentfulPaint"},{
fn:"onLCP",name:"LargestContentfulPaint"},{
fn:"onCLS",name:"CumulativeLayoutShift"},{
fn:"onFID",name:"FirstInputDelay"},{
fn:"onINP",name:"InteractionToNextPaint"}],ee=Object.assign({"./analytics.ts":async({
internalApiPromise:t})=>{
const{
analytics:n}=await t||{};n&&(globalThis.analytics=n.global)},"./app.ts":async({
api:t,internalApiPromise:n})=>{
t.app={
extensions:async()=>{
const{
app:t}=await n||{};
if(!t?.extensions)throw Error("App API is not available");
return await t.extensions()}}},"./client.ts":({
api:t,internalApiPromise:n})=>{
n.then(n=>{
n?.client?.set&&"function"==typeof n.client.set&&n.client.set(t.config)}).catch()},"./environment.ts":({
api:t})=>{
t.environment={
mobile:k(),embedded:top!==self||E(),pos:C(),intent:ot()}},"./fetch.ts":It,"./id-token.ts":Ot,"./intents.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
t.data.intent=function(){
try{
const t=new URLSearchParams(location.search).get("intent");
if(t){
const n=JSON.parse(t);
if(null==n||"object"!=typeof n||Array.isArray(n))throw Error("Invalid intent data");
if("string"!=typeof n.type||!n.type.length)throw Error("Invalid intent type");
if("string"!=typeof n.action||!n.action.length)throw Error("Invalid intent action");
if(n.data&&("object"!=typeof n.data||Array.isArray(n.data)))throw Error("Invalid intent data");
return n}}
catch(t){
console.error(t)}}();
const i=new AbortController;
if(t.intents={
register(t){
const e=new URLSearchParams(location.search).get("step_reference")||"",i=new AbortController;
return n.subscribe("AppFrame.propertiesEvent",({
properties:i})=>{
const o=function(t,n,e){
return new xt("configure","gid://flow/stepReference/"+t,n,()=>e.send("AppFrame.navigateBack"))}(e,{
properties:i},n);t(o)},{
signal:i.signal}),n.send("AppFrame.requestProperties"),()=>i.abort()},async invoke(t,n){
const i=await e;
if(!i)throw Error("Cannot invoke intent");
if(!i.intents?.invoke||"function"!=typeof i.intents.invoke)throw Error("Intents are not supported");
return new Rt(i.intents.invoke(t,n))}},ot()){
async function o(){
const t=await e||{};
if("function"!=typeof t.intents?.response?.ok||"function"!=typeof t.intents?.response?.error||"function"!=typeof t.intents?.response?.closed)throw Error("Cannot respond to intent in this context");
if(i.signal.aborted)throw Error("Cannot resolve an intent multiple times");
return i.abort(),t.intents.response}
t.intents.response={
async ok(t){
const n=await o();
return await n.ok(t)},async error(t,n){
const e=await o();
return await e.error(t,n)},async closed(){
const t=await o();
return await t.closed()}}}},"./internal-only.ts":({
api:t,internalApiPromise:n})=>{
const e={
async show(t,e){
const i=$t(e),o=await n;o&&o.internalModal&&await(o.internalModal.show?.(t,i))},async hide(t){
const e=await n;e&&e.internalModal&&await(e.internalModal?.hide?.(t))}};t._internal={
modal:e}},"./loading.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
let i=!1;t.loading=async t=>{
const{
loading:o}=await e||{};o?.start&&o?.stop?t?await o.start():await o.stop():t?i||(n.send("Loading.start"),i=!0):i&&(n.send("Loading.stop"),i=!1)}},"./navigation.ts":t=>{
const n=Ht(t);t.internalApiPromise.then(e=>{
const{
navigation:i}=e||{};
if(2===i?.version)try{
n(),Gt(t)}
catch(o){
console.error("Failed to set up navigation: "+o)}})},"./picker.ts":({
api:t,internalApiPromise:n})=>{
let e;t.picker=async function t(i){
if(e)return e.finally(()=>t(i));
const o=await n;
if(!o||"function"!=typeof o.picker)throw Error("Cannot show picker");
if(e=o.picker(i),!e)throw Error("Cannot show picker");
return e.finally(()=>e=void 0),e}},"./polaris.ts":async({
internalApiPromise:t})=>{
const{
polaris:n}=await t||{};n&&(globalThis.polaris=n.global)},"./pos.ts":({
api:t,protocol:n})=>{
const e=new Set;async function i(t,i){
const o=Yt(),r=new AbortController,a=_();n.subscribe("Cart.update",({
data:t})=>{
r.abort(),a.resolve(t)},{
signal:r.signal,id:o}),n.send("Cart."+t,{...i,id:o});
const s=await a.promise;e.forEach(t=>t(s))}
const o={
cart:{
async fetch(){
const t=Yt(),e=new AbortController,i=_();
return n.subscribe("Cart.update",({
data:t})=>{
e.abort();
const{
noteAttributes:n,lineItems:o,...r}=t,a={...r,properties:n?.reduce((t,{
name:n,value:e})=>(t[n]=e,t),{})??{},lineItems:o?o.map((t,n)=>({...t,uuid:""+n})):[]};i.resolve(a)},{
signal:e.signal,id:t}),n.send("Cart.fetch",{
id:t}),i.promise},subscribe:t=>(e.add(t),()=>{
e.delete(t)}),async clear(){
await i("clear",{})},async setCustomer(t){
await i("setCustomer",{
data:t})},async removeCustomer(){
await i("removeCustomer",{})},async addAddress(t){
await i("addCustomerAddress",{
data:t})},async updateAddress(t,n){
await i("updateCustomerAddress",{
index:t,data:n})},async applyCartDiscount(t,n,e){
await i("setDiscount",{
data:{
type:"FixedAmount"===t?"flat":"percent",amount:parseFloat(e)||0,discountDescription:n}})},async applyCartCodeDiscount(t){
await i("setCodeDiscount",{
data:{
discountCode:t}})},async removeCartDiscount(){
await i("removeDiscount",{})},async removeAllDiscounts(t){
await i("removeAllDiscounts",{
data:{
disableAutomaticDiscounts:t}})},async addCartProperties(t){
await i("setProperties",{
data:t})},async removeCartProperties(t){
await i("removeProperties",{
data:t})},async addCustomSale(t){
await i("addLineItem",{
data:{
price:t.price,quantity:t.quantity,title:t.title,taxable:t.taxable}})},async addLineItem(t,n){
await i("addLineItem",{
data:{
variantId:t,quantity:n}})},async updateLineItem(t,n){
const e=parseInt(t);await i("updateLineItem",{
index:e,data:{
quantity:n}})},async removeLineItem(t){
const n=parseInt(t);await i("removeLineItem",{
index:n})},async setLineItemDiscount(t,n,e,o){
const r=parseInt(t);await i("setLineItemDiscount",{
index:r,data:{
type:"FixedAmount"===n?"flat":"percent",discountDescription:e,amount:parseFloat(o)||0}})},async removeLineItemDiscount(t){
const n=parseInt(t);await i("removeLineItemDiscount",{
index:n})},async addLineItemProperties(t,n){
const e=parseInt(t);await i("setLineItemProperties",{
index:e,data:n})},async removeLineItemProperties(t,n){
const e=parseInt(t);await i("removeLineItemProperties",{
index:e,data:n})}},async close(){
n.send("Pos.close")},async device(){
const t=_();
return n.subscribe("getState",({
pos:n})=>{
const e=(n||{}).device,i={
name:e.name,serialNumber:e.serialNumber};t.resolve(i)},{
once:!0}),t.promise},async location(){
const t=_();
return n.subscribe("getState",({
pos:n})=>{
const e=(n||{}).location,i={
id:e.id,active:e.active,name:e.name,locationType:e.locationType,address1:e.address1,address2:e.address2,zip:e.zip,city:e.city,province:e.province,countryCode:e.countryCode,countryName:e.countryName,phone:e.phone};t.resolve(i)},{
once:!0}),t.promise}};t.pos=o},"./print.ts":({
protocol:t,internalApiPromise:n})=>{(k()||C())&&Ct(self,"print",function(){
const e=document.scrollingElement?.scrollHeight||document.body.offsetHeight;_t(async()=>{
const{
print:i}=await n||{};i?await i({
height:e}):t.send("Print.app",{
height:e})})})},"./resource-picker.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
let i;t.resourcePicker=async function t(o){
if(i)return i.finally(()=>t(o));
const r=await e,a=new Promise((t,e)=>{
const a=Yt(),{
type:s,query:c,selectionIds:u,action:l,multiple:d}=Object.assign({},Zt,o),f=Object.assign({},Zt.filter,o.filter);
if(!Qt.has(s))return e(Error("The 'type' option for resourcePicker must be one of "+Array.from(Qt).join(", ")));
const h=new AbortController,{
signal:p}=h;
function m(){
h.abort(),i=void 0}
const{
resourcePicker:w}=r||{};w?w({
type:s,query:c,selectionIds:u,action:l,multiple:d,filter:f}).then(n=>{
t(n)}).catch(t=>{
e(Error("ResourcePicker error",{
cause:t}))}).finally(()=>{
m()}):(n.subscribe("Resource_Picker.select",n=>{
m();
const e=n.selection;Object.defineProperty(e,"selection",{
value:e}),t(e)},{
id:a,signal:p}),n.subscribe("Resource_Picker.cancel",()=>{
m(),t(void 0)},{
id:a,signal:p}),$(n,t=>{
m(),e(Error("ResourcePicker error",{
cause:t}))},{
id:a,signal:p}),n.send("Resource_Picker.open",{
id:a,resourceType:s,initialQuery:c,filterQuery:f?.query,initialSelectionIds:u,actionVerb:l?.toLowerCase(),selectMultiple:d,showHidden:f?.hidden,showVariants:f?.variants,showDraft:!1!==f?.draft,showArchived:!1!==f?.archived,showDraftBadge:[!0,void 0].includes(f?.draft),showArchivedBadge:void 0===f?.archived}))});
return i=a,a}},"./reviews.ts":({
api:t,internalApiPromise:n})=>{
t.reviews={
request:async()=>{
const{
reviews:t}=await n||{},e=t?.request;
if(!e||"function"!=typeof e)throw Error("Cannot request review");
return await e()}}},"./s-app-nav.ts":hn,"./s-app-window.ts":Hn,"./save-bar.ts":({
api:t,saveBarManager:n,internalApiPromise:e})=>{
I&&(t.saveBar={
show:async t=>yn(t).show(),hide:async t=>yn(t).hide(),toggle:async t=>yn(t).toggle(),async leaveConfirmation(){
if(!n.isSaveBarVisible)return;
const t=await e;
if(!t)return;
const{
saveBar:i}=t;i&&"function"==typeof i.leaveConfirmation&&await i.leaveConfirmation();
const o=document.querySelectorAll(pn);await Promise.all(Array.from(o).map(t=>t.hide()));
const r=document.querySelectorAll("form");await Promise.all(Array.from(r).filter(J).map(t=>t.reset()))}},H(document,{
onChange(t){
n.set({
mainAppFromForm:t})},filter:t=>!Gn(t)}),K(document,{
onChange(t){
n.set({
mainAppFromCustomElement:t})},filter:t=>!Gn(t)}),b(pn,class extends v{
constructor(){
super(...arguments),this.m=!1}
static get observedAttributes(){
return["discardConfirmation"]}
get discardConfirmation(){
return this.hasAttribute("discardConfirmation")}
set discardConfirmation(t){
t?this.setAttribute("discardConfirmation",""):this.removeAttribute("discardConfirmation")}
get showing(){
return this.m}
get saveButton(){
return this.q}
get discardButton(){
return this.W}
connectedCallback(){
this.l=new MutationObserver(()=>this.o()),this.l.observe(this,{
childList:!0,subtree:!0,attributes:!0,characterData:!0}),this.o()}
disconnectedCallback(){
this.hide(),this.l?.disconnect()}
setAttribute(t,n){
super.setAttribute(t,n),this.o()}
removeAttribute(t){
super.removeAttribute(t),this.o()}
async show(){
this.m||(this.m=!0,this.o(),this.dispatchEvent(new CustomEvent("show")))}
async hide(){
this.m&&(this.m=!1,this.o(),this.dispatchEvent(new CustomEvent("hide")))}
async toggle(){
this.m?await this.hide():await this.show()}
o(){
an(this,wn),this.V(),this.dispatchEvent(new CustomEvent(G,{
bubbles:!0,cancelable:!0}))}
V(){
const t=this.querySelectorAll(":scope > [variant=primary]"),n=this.querySelectorAll(":scope > :not([variant=primary])");this.q=bn(t[t.length-1]),this.W=bn(n[n.length-1])}}))},"./scanner.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
t.scanner={
capture:async()=>{
const{
scanner:t}=await e||{};
return t?.capture?t.capture():new Promise((t,e)=>{
const i=Yt(),o=new AbortController,{
signal:r}=o;
function a(t){
o.abort(),e(Error("Scanner error",{
cause:t}))}
function s(){$(n,a,{
signal:r,id:i}),n.subscribe("Scanner.capture",({
data:n})=>{
o.abort(),n&&n.scanData?t({
data:n.scanData}):e(Error("No scanner data"))},{
id:i,signal:r}),n.send("Scanner.open.camera",{
id:i})}
n.subscribe("getState",({
features:t})=>{
Xn(t)?s():function(){
const t=Yt(),e=new AbortController;o.signal.addEventListener("abort",()=>e.abort()),$(n,t=>{
e.abort(),a(t)},{
signal:e.signal,id:t}),n.subscribe("Features.update",({
features:t})=>{
Xn(t)&&(e.abort(),s())},{
signal:e.signal,id:t}),n.send("Features.request",{
id:t,feature:"Scanner",action:Kn})}()},{
once:!0,signal:r})})}}},"./scopes.ts":async({
api:t,internalApiPromise:n})=>{
const e={
query:async()=>{
const{
scopes:t}=await n||{};
if(!t||"function"!=typeof t.query)throw Error("Scopes API is not available");
return t.query()},request:async t=>{
const{
scopes:e}=await n||{};
if(!e||"function"!=typeof e.request)throw Error("Scopes API is not available");
return e.request(t)},revoke:async t=>{
const{
scopes:e}=await n||{};
if(!e||"function"!=typeof e.revoke)throw Error("Scopes API is not available");
return e.revoke(t)}};t.scopes=e},"./share.ts":({
protocol:t,internalApiPromise:n})=>{
if(!k()&&!C())return;
const e=navigator.share;Ct(navigator,"share",async function(i){
if(!i)return e.call(navigator,i);
const{
share:o}=await n||{},{
title:r,text:a,url:s}=i;
if(!o)return new Promise((n,e)=>{
const i=Yt(),o=new AbortController,{
signal:c}=o;
function u(t){
o.abort(),e(Error("Share error",{
cause:t}))}$(t,u,{
signal:c,id:i}),t.subscribe("Share.close",t=>{
const{
success:e}=t;e?(o.abort(),n()):u("Share is dismissed")},{
signal:c,id:i}),t.send("Share.show",{
id:i,text:a??r,url:s})});await o({
text:a??r,url:s})})},"./shopifyQL.ts":async({
api:t,internalApiPromise:n})=>{
const{
shopifyQL:e}=await n||{};e&&(t.shopifyQL=e)},"./shortcut.ts":({
protocol:t,internalApiPromise:n})=>{
Jn||(Jn=!0,Yn.forEach(e=>{
U({...e,handler:async()=>{
const{
shortcut:i}=await n||{};i?await i(e):t.send("Shortcut.invoke",e)}})}))},"./sidekick.ts":({
api:t,internalApiPromise:n,rpcEventTarget:e})=>{
const i=async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.isOpen)throw Error("Sidekick API is not available");
return t.isOpen()},o=async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.open)throw Error("Sidekick API is not available");
return t.open()},a=async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.close)throw Error("Sidekick API is not available");
return t.close()};n.then(t=>{
t&&t.sidekick&&e.addEventListener("shopify:sidekick:visibilitychange",t=>{
globalThis.dispatchEvent(new CustomEvent("shopify:sidekick:visibilitychange",{
detail:t.detail}))})});
const c={
isEnabled:async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.isEnabled)throw Error("Sidekick API is not available");
return t.isEnabled()},isMaintenanceActive:async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.isMaintenanceActive)throw Error("Sidekick API is not available");
return t.isMaintenanceActive()},isOpen:i,open:o,close:a,toggle:async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.launch)throw Error("Sidekick API is not available");
return await i()?a():o()},generate:async t=>{
const{
sidekick:e}=await n||{};
if(!e||"function"!=typeof e.generate)throw Error("Sidekick API is not available");
let i;
const o=new ReadableStream({
start(t){
i=t}}),a=await e.generate({...t,onStreamEvent:n=>{"message"===n.event&&i.enqueue(n.data),t.onStreamEvent?.(n)}});
return a.done().finally(()=>{
i.close()}),r(a),{...a,content:o}},launch:async t=>{
const{
sidekick:e}=await n||{};
if(!e||"function"!=typeof e.launch)throw Error("Sidekick API is not available");
return e.launch(t)},addHint:async t=>{
const{
sidekick:e}=await n||{};
if(!e||"function"!=typeof e.addHint)throw Error("Sidekick API is not available");
return e.addHint(t)},addSelectionNode:async t=>{
const{
sidekick:e}=await n||{};
if(!e||"function"!=typeof e.addSelectionNode)throw Error("Sidekick API is not available");e.addSelectionNode(t)},removeSelectionNode:async()=>{
const{
sidekick:t}=await n||{};
if(!t||"function"!=typeof t.removeSelectionNode)throw Error("Sidekick API is not available");t.removeSelectionNode()},registerToolHandler:t=>{
let e,i=!1;
function o(){
i=!0,e?.(),s(e),e=void 0}
return _t(async()=>{
const{
sidekick:a}=await n||{};
if(!a||"function"!=typeof a.registerToolHandler)throw Error("Sidekick API is not available");e=await a.registerToolHandler(t),r(e),i&&o()}),o},registerContextCallback:async t=>{
let e,i=!1;
function o(){
i=!0,e?.(),s(e),e=void 0}
return _t(async()=>{
const{
sidekick:a}=await n||{};
if(!a||"function"!=typeof a.registerContextCallback)throw Error("Sidekick API is not available");e=await a.registerContextCallback(t),r(e),i&&o()}),o}};t.sidekick=c},"./support.ts":({
api:t,internalApiPromise:n,rpcEventTarget:e})=>{
let i=null;t.support={
registerHandler:async t=>{
const{
support:e}=await n||{};i=t,e?.callbackRegistered&&"function"==typeof e.callbackRegistered&&e.callbackRegistered()}},e.addEventListener("supportRequested",async t=>{
await(i?.())})},"./telemetry.ts":async({
internalApiPromise:t})=>{"undefined"!=typeof window&&window.addEventListener("_PreactCustomElement:connected",async n=>{
const e=n.target,i=e.tagName.toLowerCase(),o=function(t){
const n=[];
for(let e=0;e<t.attributes.length;e++){
const i=t.attributes[e];n.push(i.name)}
return n}(e),r=JSON.stringify(o),a=await t;a&&a.telemetry&&"function"==typeof a.telemetry.increment&&a.telemetry.increment("ui-component",{
component:i,attributes:r})})},"./title-bar.ts":({
protocol:t,internalApiPromise:n})=>{
let e;
const i=new Promise(n=>{
t.subscribe("getState",({
features:t})=>{
const e=t?.MarketingExternalActivityTopBar||{},{
Dispatch:i}=e["APP::MARKETINGEXTERNALACTIVITYTOPBAR::UPDATE"]||{};n(i)},{
once:!0})});
function o(){
if(e)return e.getAttribute("title")??document.title}
function r(t){
const n=document.querySelector("s-page");
if(n){
const e=`${
Rn}, ${$n}, ${_n}`,i=Array.from(n.querySelectorAll(e)).find(n=>n[En]==t);
if(i)return void i.click();
const o=Array.from(document.querySelectorAll("s-menu, s-button-group"));
for(const n of o){
const e=Array.from(n.querySelectorAll("s-button")).find(n=>n[En]==t);
if(e)return void e.click()}}
const i=Array.from(e?.querySelectorAll("button, a")??[]).find(n=>n[En]==t);i?.click()}
function a(t){
const{
id:n,label:e,icon:i,tone:o,disabled:a,loading:s}=t;
return{
label:e,...i&&{
icon:i},...o&&{
tone:o},disabled:a,loading:s,onAction:()=>r?.(n)}}
async function s(){
let r;
if(function(){
const t=document.documentElement?.getElementsByTagName?.(In);
if(t&&t.length){
for(const n of t)if(!Gn(n)){
e=n;break}}
else e=void 0}(),e){
const{
primaryButton:t,secondaryButtons:n,breadcrumb:i}=e.buttons?.()??{};r={
title:o()},t&&(r.buttons=Object.assign(r.buttons??{},{
primary:t})),n&&(r.buttons=Object.assign(r.buttons??{},{
secondary:n})),i&&(r.breadcrumbs={
id:"breadcrumb",label:i})}
else{
const t=kn({
hideElements:!0,context:document});
if(t){
if(r={
title:t.title||o()},t.breadcrumb&&(t.breadcrumb[En]="breadcrumb",r.breadcrumbs=Pn(t.breadcrumb)),t.primaryAction){
const n=Pn(t.primaryAction);r.buttons=Object.assign(r.buttons??{},{
primary:n})}
if(t.secondaryActions){
const n=Cn(t.secondaryActions,{
hideElements:!0,context:document});r.buttons=Object.assign(r.buttons??{},{
secondary:n})}
t.accessory&&(r.accessory=t.accessory)}
else r={
title:void 0}}
if(await i)t.send("MarketingExternalActivityTopBar.update",r);else{
const{
titleBar:e}=await n||{};
if(e?.set){
const t={
title:r.title};r.breadcrumbs&&(t.breadcrumbs=a(r.breadcrumbs)),r.buttons?.primary&&(t.primaryAction=a(r.buttons.primary)),r.buttons?.secondary&&(t.secondaryActions=r.buttons.secondary.map(t=>"buttons"in t?function(t){
const{
label:n,icon:e,disabled:i,buttons:o}=t;
return{
label:n,...e&&{
icon:e},disabled:i,actions:o.map(a)}}(t):a(t))),r.accessory&&(t.accessory=r.accessory),e.set(t)}
else t.send("TitleBar.update",r)}}
const c=Object.getOwnPropertyDescriptor(Document.prototype,"title");Object.defineProperty(document,"title",{...c,set(t){
c.set.call(this,t),s()}}),new MutationObserver(t=>{
for(let n of t){
if(Un(n.target)||[].some.call(n.addedNodes,Bn)||[].some.call(n.removedNodes,Bn))return s();
const t=n.target instanceof Element?n.target:n.target.parentElement;
if("S-PAGE"===n.target.nodeName||[].some.call(n.addedNodes,t=>"S-PAGE"===t.nodeName)||[].some.call(n.removedNodes,t=>"S-PAGE"===t.nodeName)||t?.closest("s-page"))return s()}}).observe(document,{
subtree:!0,childList:!0,characterData:!0,attributes:!0}),t.subscribe("TitleBar.buttons.button.click",t=>r?.(t.id)),t.subscribe("TitleBar.breadcrumbs.button.click",t=>r?.(t.id)),t.subscribe("MarketingExternalActivityTopBar.buttons.button.click",t=>r?.(t.id)),b(In,class extends v{
static get observedAttributes(){
return["title"]}
connectedCallback(){
this.l=new MutationObserver(()=>{
Gn(this)||this.o(),this.G()}),this.l.observe(this,{
childList:!0,subtree:!0,attributes:!0,characterData:!0}),this.o()}
H(){
const t=this.querySelector(":scope > [variant=breadcrumb]");
return t&&(t[En]="breadcrumb"),t}
G(){
this.dispatchEvent(new Event("change"))}
o(){
an(this,xn),s()}
disconnectedCallback(){
this.o(),this.l?.disconnect()}
attributeChangedCallback(){
this.o()}
buttons(){
const t=this.H(),n=this.querySelector(":scope > [variant=primary]"),e=Array.from(this.querySelectorAll(":scope > :not([variant=primary]):not([variant=breadcrumb]), :scope > section")).map(t=>"SECTION"!==t.nodeName?Fn(t):function(t){
t[En]||(t[En]=Yt());
const n=t[En],e=t.getAttribute("label")??"Actions",i=t.getAttribute("icon")||void 0,o="S-MENU"===t.tagName?"menu":"S-BUTTON-GROUP"===t.tagName?"inline":void 0;
return{
id:n,label:e,...i&&{
icon:i},buttons:Array.from(t.querySelectorAll("button, a")).map(Fn),groupType:o}}(t));
return{...t?{
breadcrumb:t.textContent}:{},...n?{
primaryButton:Fn(n)}:{},secondaryButtons:e}}}),s()},"./toast.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
t.toast={
show(t,i={}){
const o=Yt();
return _t(async()=>{
const{
toast:r}=await e||{};
if(r?.show)await r.show(t,{...Qn,...i,id:o});else{
const e=new AbortController,{
action:r,duration:a,isError:s,onAction:c,onDismiss:u}=Object.assign({},Qn,i);n.subscribe("Toast.action",()=>c?.(),{
id:o,signal:e.signal}),n.subscribe("Toast.clear",()=>{
e.abort(),u?.()},{
id:o,signal:e.signal}),n.send("Toast.show",{
id:o,message:t,isError:s,duration:a,action:r?{
content:r}:void 0})}}),o},hide(t){_t(async()=>{
const{
toast:i}=await e||{};i?.hide?await i.hide(t):n.send("Toast.clear",{
id:t})})}}},"./tools.ts":async({
api:t,internalApiPromise:n})=>{
const e=new Map,i=new Set;t.tools={
register(t,o){
const r=new AbortController;
return i.add(r),_t(async()=>{
const{
tools:i}=await n||{};
if(r.signal.aborted)return;
if(!i||"function"!=typeof i.register)throw Error("Tools API is not available");e.get(t)?.();
const a=await i.register(t,o);r.signal.aborted||e.set(t,a)}).finally(()=>{
i.delete(r)}),()=>{
e.get(t)?.(),e.delete(t)}},unregister(t){
const o=new AbortController;i.add(o),e.get(t)?.(),e.delete(t),_t(async()=>{
const{
tools:e}=await n||{};
if(!o.signal.aborted){
if(!e||"function"!=typeof e.unregister)throw Error("Tools API is not available");await e.unregister(t)}}).finally(()=>{
i.delete(o)})},clear(){
e.forEach(t=>t()),e.clear(),i.forEach(t=>t.abort()),i.clear(),_t(async()=>{
const{
tools:t}=await n||{};
if(!t||"function"!=typeof t.clear)throw Error("Tools API is not available");await t.clear()})}}},"./ui-modal.ts":Zn,"./ui-nav-menu.ts":te,"./user.ts":({
api:t,protocol:n,internalApiPromise:e})=>{
t.user=async function(){
const{
user:t}=await e||{};
return t?await t():new Promise(t=>{
n.subscribe("getState",({
staffMember:n,pos:e})=>{
const i={...n,...(e||{}).user},o={
id:i.id,name:i.name||i.firstName,firstName:i.firstName,lastName:i.lastName,email:i.email,accountAccess:i.accountAccess,accountType:i.accountType||i.userType};t(o)},{
once:!0})})}},"./visibility.ts":({
rpcEventTarget:t})=>{
const n={
client:document.visibilityState,host:document.visibilityState};t.addEventListener("visibilitychange",t=>{
n.host=t.detail.visibilityState,globalThis.document.dispatchEvent(new Event("visibilitychange"))}),document.addEventListener("visibilitychange",t=>{
t.isTrusted&&(n.client="visible"===n.client?"hidden":"visible")}),Object.defineProperty(globalThis.document,"hidden",{
configurable:!0,enumerable:!0,get:()=>"hidden"===globalThis.document.visibilityState}),Object.defineProperty(globalThis.document,"visibilityState",{
configurable:!0,enumerable:!0,get(){
const{
client:t,host:e}=n;
return"visible"===e&&"visible"===t?"visible":"hidden"}})},"./web-vitals.ts":async({
api:t,protocol:n,internalApiPromise:e,rpcEventTarget:i})=>{
if("undefined"==typeof window||window.__is_web_vitals_initialized__||C()||k()&&!P())return;window.__is_web_vitals_initialized__=!0;
let o=null;t.webVitals={
onReport:async t=>{
o=t;
const n=await e||{};n&&n.telemetry&&"function"==typeof n.telemetry.increment&&n.telemetry.increment("web-vitals-report-listener-added")}};
const r=await Promise.resolve().then(()=>ni),{
config:a}=await t||{},{
webVitals:s}=await e||{},c=!!s,u={
reportAllChanges:c};
let l=!0;ne.forEach(({
fn:t,name:i})=>{
r[t]((t=>async i=>{
if(c&&"function"==typeof s?.report?s.report({
id:i.id,name:i.name,value:i.value}):n.send("WebVitals."+t,{
id:i.id,metricName:i.name,value:i.value}),l&&"LCP"===i.name){
l=!1;
const{
perceivedPerformance:t}=await e||{};t?.appIsReady&&"function"==typeof t.appIsReady&&t.appIsReady()}
a.debug?.webVitals&&console.debug(i)})(i),u)}),i.addEventListener("webVitalsReport",async t=>{
await(o?.({
metrics:"metrics"in t.detail&&Array.isArray(t.detail.metrics)?t.detail.metrics:[]}))})}});!function(){
try{
if("then"in(self.shopify?.ready||{}))return}
catch(M){}
if(!function(){
try{
if(!document.currentScript)return console.error('The script tag loading App Bridge has `type="module"`'),!1;
const t=document.currentScript;
return t.async?(console.error("The script tag loading App Bridge has `async`"),!1):t.defer?(console.error("The script tag loading App Bridge has `defer`."),!1):t.src?new URL(t.src).hostname!=lt?(console.error("The script tag loading App Bridge is not loading App Bridge from the Shopify CDN."),!1):(0!==[...document.scripts].filter(t=>function(t){
return!!t.src&&!t.defer&&!t.async&&"module"!==t.type&&!t.dataset.appBridgeCompatible&&/^ *(|(text|application)\/(x-)?(java|ecma)script) *$/i.test(t.type)}(t)).indexOf(t)&&console.warn("The script tag loading App Bridge should be the first script tag in the document. Loading other blocking scripts first can cause unexpected behavior."),!0):(console.error("The script tag loading App Bridge is not loading App Bridge from the Shopify CDN."),!1)}
catch(t){
return console.error("App Bridge failed to self-validate",t),!1}}())throw Error("Shopify’s App Bridge must be included as the first <script> tag and must link to Shopify’s CDN. Do not use async, defer or type=module. Aborting.");document.currentScript;
const{
config:t,params:n}=function(){
const t=new URLSearchParams(location.search),n=ut;w(n,function(){
try{
const n=sessionStorage.getItem("app-bridge-config");
if(n)try{
return JSON.parse(n)}
catch(t){}
return{}}
catch(M){
return{}}}()),w(n,window.shopify?.config??{}),w(n,function(){
const t=Array.from(document.getElementsByTagName("script"));document.currentScript&&t.unshift(document.currentScript);
const n={};
for(const i of t)if(i.src)try{
const t=new URL(i.src);t.hostname===lt&&rt.test(t.pathname)&&(t.searchParams.forEach((t,e)=>{
t&&(n[e]=t)}),w(n,i.dataset))}
catch(e){}
else if("shopify/config"===i.type)try{
w(n,JSON.parse(i.textContent??"{}"))}
catch(M){
console.warn("App Bridge Next: failed to parse configuration. "+M)}
return n}()),w(n,function(){
const t=Array.from(document.querySelectorAll('meta[name^="shopify-"i]')),n={};
for(const e of t){
if(!e.hasAttribute("name"))continue;
const t=m(e.getAttribute("name").replace(/shopify-/i,""));n[t]=dt(t,e.getAttribute("content")??void 0)}
return n}()),w(n,function(t){
return{
shop:t.get("shop"),host:t.get("host"),locale:t.get("locale")}}(t));
const e=function(t){
const n=ft.filter(n=>!(n in t));
if(0!==n.length)throw Error("App Bridge Next: missing required configuration fields: "+n);
return t}(n);
return{
config:e,params:t}}();Object.freeze(t),function(t){
try{
sessionStorage.setItem("app-bridge-config",JSON.stringify(t))}
catch(n){}}(t);
const e=t.host?atob(t.host):t.shop,o=new URL("https://"+e).origin,a=globalThis.shopify?.transport||(E()&&window===window.top?{
addEventListener:globalThis.addEventListener.bind(globalThis),removeEventListener:globalThis.removeEventListener.bind(globalThis),postMessage(t){
const n=JSON.stringify({
id:"unframed://fromClient",origin:new URL(location.toString()).origin,data:t});window.MobileWebView.postMessage(n)}}:{
addEventListener:globalThis.addEventListener.bind(globalThis),removeEventListener:globalThis.removeEventListener.bind(globalThis),postMessage:globalThis.parent.postMessage.bind(globalThis.parent)}),c=function(t=!1){
let n=null,e=t?null:new Set;
var i=Et("value"),o=Et("callbacks");
class r{
constructor(t){
var n;Object.defineProperty(this,i,{
writable:!0,value:void 0}),Object.defineProperty(this,o,{
writable:!0,value:new Set}),kt(this,i)[i]=t,null==(n=e)||n.add(this)}
get value(){
return kt(this,i)[i]}
set value(t){
t!==kt(this,i)[i]&&(kt(this,i)[i]=t,kt(this,o)[o].forEach(n=>n(t)))}
subscribe(t){
return kt(this,o)[o].add(t),()=>{
kt(this,o)[o].delete(t)}}}
class a extends r{
constructor(t){
var e;super(t),null==(e=n)||e.call(this,t)}
get current(){
return this.value}
get value(){
return c().get.call(this)}
set value(t){
throw Error("This signal is read-only")}}
let s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a.prototype),"value");
function c(){
if(!s||"function"!=typeof s.get||"function"!=typeof s.set)throw Error("Value descriptor is not found");
return s}
function u(){
e=null}
return{
SignalLike:a,applyRealSignal:function(t){
if(!e)return;n=t;
const i=c();
if(Object.setPrototypeOf(a.prototype,t.prototype),s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(a.prototype),"value"),Object.defineProperties(a.prototype,{$$typeof:{
configurable:!0,value:t.prototype.$$typeof},ref:{
configurable:!0,value:null},constructor:{
configurable:!0,value:void 0},type:{
configurable:!0,value:t.prototype.type},props:{
configurable:!0,get(){
return{
data:this}}},K:{
configurable:!0,value:1}}),e)for(const n of e){
const e=i.get.call(n);t.call(n,e)}
u()},sealImplementation:u,updateSignalValue:function(t,n){
c().set.call(t,n)}}}(),l=function(t){
const n=t.decodeSignal;
return t=>{
const e=d(t),i=(t,n=new Map)=>{
if(n.has(t))return n.get(t);n.set(t,void 0);
let e=t;
if(function(t){
return null!=t&&"object"==typeof t&&"value"in t&&"peek"in t}(t)){
const n=t.peek();
let i=n;
const o={
value:n,subscribe(n){
r(n);
const e=t.subscribe(t=>{
t!==i&&(i=t,async function(){
try{
const e=n(t);
return await Promise.resolve(e)}
catch{}}())});
return()=>{
e(),s(n)}}};e={[bt]:o}}
else t instanceof File?e={
metadata:{
name:t.name,type:t.type,lastModified:t.lastModified},content:gt(t)}:Array.isArray(t)?e=t.map(t=>i(t,n)):u(t)&&(e=Object.keys(t).reduce((e,o)=>(e[o]=i(t[o],n),e),{}));
return n.set(t,e),e},o=t=>{
if(t&&"object"==typeof t&&bt in t){
const e=t[bt];
return n(e)}
return function(t){
return"object"==typeof t&&null!==t&&"metadata"in t&&"content"in t&&"object"==typeof t.metadata&&null!==t.metadata&&"name"in t.metadata&&"type"in t.metadata&&"lastModified"in t.metadata&&"string"==typeof t.content}(t)?new File([yt(t.content)],t.metadata.name,{
type:t.metadata.type,lastModified:t.metadata.lastModified}):Array.isArray(t)?t.map(t=>o(t)):u(t)?Object.keys(t).reduce((n,e)=>(n[e]=o(t[e]),n),{}):t};
return{...e,encode:t=>e.encode(i(t)),decode:t=>o(e.decode(t)),call:(t,n)=>e.call(t,o(e.decode(n)))}}}({
decodeSignal(t){
r(t);
const n=new c.SignalLike(t.value);
return t.subscribe(t=>c.updateSignalValue(n,t)),n}}),p=function(t,n){
let e="";
const i={
name:"app-bridge-cdn",version:"1"};
function o(o,r){"dispatch"===o&&(r.clientInterface=i,r.version=i.version);
const a={
type:o,payload:r,source:n};t.postMessage(a,e||"*")}
function r(n,i,{
signal:o}={}){
o?.aborted||t.addEventListener("message",function(t){
if(e){
if(t.origin!==e)return}
else{
if(!(ht.test(new URL(t.origin).hostname)&&t.origin!==location.origin||E()&&t.origin===location.origin))return;e=t.origin}
const o=t.data;
if(null!=o&&"object"==typeof o&&o.payload&&o.type)switch(o.type){
case"getState":"getState"===n&&i(o.payload,o);break;case"dispatch":("function"==typeof n?n(o.payload.type):n===o.payload.type)&&i(o.payload.payload,o)}},{
signal:o})}
return{
send:function(t,n){"getState"!==t?o("dispatch",mt(t,n)):o("getState",{})},subscribe:function(t,n,e={}){
if("getState"===t)return r("getState",n,e),o("getState",{}),()=>{};
const i=new AbortController;e?.signal?.addEventListener("abort",()=>i.abort());
const a=mt(t,e.id?{
id:e.id}:void 0);i.signal.addEventListener("abort",()=>{
o("unsubscribe",a)}),r(a.type,(t,o)=>{(function(t,n){
return void 0===t||n?.id===t})(e.id,t)&&(n(t,o),!0===e.once&&i.abort())},{
signal:i.signal}),o("subscribe",a),r(mt("Client.initialize").type,()=>{
o("unsubscribe",a),o("subscribe",a)},{
signal:i.signal})}}}(a,t),b={
config:t,protocol:p,origin:o,data:{},setSignals(t){
c.applyRealSignal(t)}};Object.defineProperty(self,"shopify",{
configurable:!0,writable:!0,value:b});
const y=new et,v=_(),C=v.promise.then(t=>t?.internal),T=k()&&!P()&&window===top;
if(top===window&&!E()&&!b.config.disabledFeatures?.includes("auto-redirect")||T)return function(t,n){
const e=new URL(location.pathname,location.origin);t.forEach((t,n)=>{"host"!==n&&"shop"!==n&&(e.searchParams.get(n)||e.searchParams.set(n,t))});
const i=e.pathname+e.search,{
host:o,shop:r}=n.config,a=`${"https://"+(o?atob(o):r+"/admin")}/apps/${
n.config.apiKey}${
i}`;
return location.assign(a)}(n,b);
if(n.get("shopify-reload")&&!n.get("id_token"))return v.resolve(void 0),I({
idToken:Ot,fetch:It},[]),async function(t){
const n=new URL(t,location.origin);
if(n.origin!==location.origin)throw Error(`?shopify-reload must be same-origin (${
n.origin} !== ${
location.origin})`);document.removeChild(document.documentElement),n.searchParams.delete("shopify-reload"),history.replaceState(null,"",n.href);
const e=await fetch(n.href,{
mode:"same-origin",headers:{
accept:"text/html","X-Shopify-Bounce":"1"},window:null}),i=(e.headers.get("content-type")||"").trim();
if(i&&!/^text\/html(\s*;|$)/i.test(i))throw Error("Refusing to redirect to non-html mimetype");
const o=e.body.pipeThrough(new TextDecoderStream).getReader();
for(;;){
const{
value:t,done:n}=await o.read();
if(n)break;
let e=t;document.write(e)}
document.close()}(n.get("shopify-reload"));
if(O)return v.resolve(void 0),void async function(){
const t=window.name.endsWith("/src"),n=Vn(`frame:${
L.apiKey}/main`)||Vn(S);
if(n){
window.opener=n,window.fetch=n.fetch,window.shopify=n.shopify,window.polaris=n.polaris;
const t=window.open;Ct(self,"open",function(n,e,i){
return null!=n&&"https:"!==qt(n).protocol?window.opener.open(n,e,i):t.call(this,n,e,i)})}
function e(){
document.head.appendChild(Wn());
const t=B();window.top?.postMessage({
type:"load"},t),function(t){
let n,e=-1;new ResizeObserver(function(i){
n&&window.clearTimeout(n),n=window.setTimeout(()=>{
var n;(n=i[0].contentRect.height)!==e&&(e=n,window.top?.postMessage({
type:"resize",height:n},t))},16)}).observe(document.body)}(t),function(t){[{
keys:["Escape"]},{
keys:["k"],held:["Meta","Control"]},{
keys:["."],held:["Meta","Control"]}].forEach(n=>{
U({...n,handler:()=>{
window.top?.postMessage({
type:"keyboard",payload:n},t)}})})}(t),window.addEventListener("beforeunload",()=>{
const t=B();window.top?.postMessage({
type:"unload"},t)})}
t?(await async function(){
return new Promise(t=>{
const n=new AbortController;"loading"===document.readyState?document.addEventListener("DOMContentLoaded",function(){
n.abort(),t()},{
signal:n.signal}):t()})}(),e()):(await async function(){
document.removeChild(document.documentElement);
const t=document.createElement("html");t.appendChild(document.createElement("head")),t.appendChild(document.createElement("body")),document.append(t),document.close(),n&&await qn(n.document,document)}(),e())}();
function I(t,n=[]){
const e=Object.entries(t).filter(([t])=>!function(t,n){
const e=g(t.split("/").pop().split(".")[0]||"");
return n.map(g).includes(e)}(t,n)),i=function(t){
const n={};
return{
async set(e){
const i=await t;
if(!i)return;Object.assign(n,e);
const{
mainAppFromForm:o,mainAppFromCustomElement:r,maxModalFromForm:a,maxModalFromCustomElement:s,appWindowFromForm:c,appWindowFromCustomElement:u,classicModalFromForm:l,classicModalFromCustomElement:d}=n,f=r??o??d??l??null,h=s??a??null,p=u??c??null;i.saveBar&&"function"==typeof i.saveBar.set&&(await i.saveBar.set(f,"main-app"),await i.saveBar.set(h,"max-modal"),await i.saveBar.set(p,"app-window"))},get isSaveBarVisible(){
return Object.values(n).filter(Boolean).length>0}}}(C);e.map(async([t,n])=>{
try{
n({
api:b,protocol:p,internalApiPromise:C,saveBarManager:i,rpcEventTarget:y})}
catch(e){
console.error(`Initializing ${
t} failed: ${
e?.message}\n${
e.stack}`)}})}
p.send("Client.initialize"),(async()=>{
const t=await async function(t,n,e){
const o=new Promise((o,r)=>{
const a=new AbortController;t.subscribe("Client.initialize",()=>{
setTimeout(()=>{
a.signal.aborted||(a.abort(),r(Error("Host did not expose RPC")))},100)},{
signal:a.signal}),t.subscribe("Client.rpc",({
port:t})=>{
const r=function(t,{
uuid:n=h,createEncoder:e=d,callable:o}={}){
let r=!1,a=t;
const s=new Map,c=new Map,u=function(t,n){
let e;
if(null==n){
if("function"!=typeof Proxy)throw Error("You must pass an array of callable methods in environments without Proxies.");
const n=new Map;e=new Proxy({},{
get(e,i){
if(n.has(i))return n.get(i);
const o=t(i);
return n.set(i,o),o}})}
else{
e={};
for(const i of n)Object.defineProperty(e,i,{
value:t(i),writable:!1,configurable:!0,enumerable:!0})}
return e}(w,o),l=e({
uuid:n,release(t){
p(3,[t])},call(t,e,i){
const o=n(),r=b(o,i),[a,s]=l.encode(e);
return p(5,[o,t,a],s),r}});
return a.addEventListener("message",m),{
call:u,replace(t){
const n=a;a=t,n.removeEventListener("message",m),t.addEventListener("message",m)},expose(t){
for(const n of Object.keys(t)){
const e=t[n];"function"==typeof e?s.set(n,e):s.delete(n)}},callable(...t){
if(null!=o)for(const n of t)Object.defineProperty(u,n,{
value:w(n),writable:!1,configurable:!0,enumerable:!0})},terminate(){
p(2,void 0),y(),a.terminate&&a.terminate()}};
function p(t,n,e){
r||a.postMessage(n?[t,n]:[t],e)}
async function m(t){
if(r)return;
const{
data:n}=t;
var e;
if(Array.isArray(e=n)&&"number"==typeof e[0]&&(null==e[1]||Array.isArray(e[1])))switch(n[0]){
case 2:y();break;case 0:{
const t=new i,[e,r,a]=n[1],c=s.get(r);
try{
if(null==c)throw Error(`No '${
r}' method is exposed on this endpoint`);
const[n,i]=l.encode(await c(...l.decode(a,[t])));p(1,[e,void 0,n],i)}
catch(o){
const{
name:t,message:n,stack:i}=o;
throw p(1,[e,{
name:t,message:n,stack:i}]),o}
finally{
t.release()}
break}
case 1:{
const[t,e,i]=n[1],o=c.get(t);
if(null==o)throw new f({
callId:t,error:e,result:i});o(...n[1]),c.delete(t);break}
case 3:{
const[t]=n[1];l.release(t);break}
case 6:{
const[t,e,i]=n[1],o=c.get(t);
if(null==o)throw new f({
callId:t,error:e,result:i});o(...n[1]),c.delete(t);break}
case 5:{
const[t,e,i]=n[1];
try{
const n=await l.call(e,i),[o,r]=l.encode(n);p(6,[t,void 0,o],r)}
catch(o){
const{
name:n,message:e,stack:i}=o;
throw p(6,[t,{
name:n,message:e,stack:i}]),o}
break}}}
function w(t){
return(...e)=>{
if(r)return Promise.reject(Error("You attempted to call a function on a terminated web worker."));
if("string"!=typeof t&&"number"!=typeof t)return Promise.reject(Error("Can’t call a symbol method on a remote endpoint: "+t.toString()));
const i=n(),o=b(i),[a,s]=l.encode(e);
return p(0,[i,t,a],s),o}}
function b(t,n){
return new Promise((e,i)=>{
c.set(t,(t,o,r)=>{
if(null==o)e(r&&l.decode(r,n));else{
const t=Error();Object.assign(t,o),i(t)}})})}
function y(){
var t;r=!0,s.clear(),c.clear(),null===(t=l.terminate)||void 0===t||t.call(l),a.removeEventListener("message",m)}}((s=t,{
postMessage:(...t)=>s.postMessage(...t),addEventListener:(...t)=>s.addEventListener(...t),removeEventListener:(...t)=>s.removeEventListener(...t),terminate(){
s.close()}}),{
createEncoder:e});
var s;t.start(),a.abort(),r.expose({
dispatchEvent:n.dispatchEvent.bind(n)}),o(r.call.getApi()),r.call.onClientReady()},{
signal:a.signal})});
try{
const t=await o;
return r(t),t}
catch(M){
console.error(M)}}(p,y,l);v.resolve(t)})(),I(ee,t.disabledFeatures),function(t){
if(!A("MobileBridgeNext"))return;
const n=document.createElement("style");n.textContent="\n    :root { --shopify-safe-area-inset-bottom: 0px; }\n    body::after { content: ''; display: block; height: var(--shopify-safe-area-inset-bottom); }\n  ",document.head.appendChild(n),t.then(t=>{
const n=t?.safeAreaInsets?.bottom;
if(!n)return;
const e=t=>{
document.documentElement.style.setProperty("--shopify-safe-area-inset-bottom",t+"px")};e(n.value??0),n.subscribe?.(t=>e(t))})}(C),p.send("Loading.stop"),b.ready=Promise.resolve()}();
var ie,oe,re,ae,se,ce=-1,ue=function(t){
addEventListener("pageshow",function(n){
n.persisted&&(ce=n.timeStamp,t(n))},!0)},le=function(){
return window.performance&&performance.getEntriesByType&&performance.getEntriesByType("navigation")[0]},de=function(){
var t=le();
return t&&t.activationStart||0},fe=function(t,n){
var e=le(),i="navigate";
return ce>=0?i="back-forward-cache":e&&(document.prerendering||de()>0?i="prerender":document.wasDiscarded?i="restore":e.type&&(i=e.type.replace(/_/g,"-"))),{
name:t,value:void 0===n?-1:n,rating:"good",delta:0,entries:[],id:"v3-".concat(Date.now(),"-").concat(Math.floor(8999999999999*Math.random())+1e12),navigationType:i}},he=function(t,n,e){
try{
if(PerformanceObserver.supportedEntryTypes.includes(t)){
var i=new PerformanceObserver(function(t){
Promise.resolve().then(function(){
n(t.getEntries())})});
return i.observe(Object.assign({
type:t,buffered:!0},e||{})),i}}
catch(o){}},pe=function(t,n,e,i){
var o,r;
return function(a){
var s,c;n.value>=0&&(a||i)&&((r=n.value-(o||0))||void 0===o)&&(o=n.value,n.delta=r,n.rating=(s=n.value)>(c=e)[1]?"poor":s>c[0]?"needs-improvement":"good",t(n))}},me=function(t){
requestAnimationFrame(function(){
return requestAnimationFrame(function(){
return t()})})},we=function(t){
var n=function(n){"pagehide"!==n.type&&"hidden"!==document.visibilityState||t(n)};addEventListener("visibilitychange",n,!0),addEventListener("pagehide",n,!0)},be=function(t){
var n=!1;
return function(e){
n||(t(e),n=!0)}},ye=-1,ve=function(){
return"hidden"!==document.visibilityState||document.prerendering?1/0:0},ge=function(t){"hidden"===document.visibilityState&&ye>-1&&(ye="visibilitychange"===t.type?t.timeStamp:0,Ee())},Ae=function(){
addEventListener("visibilitychange",ge,!0),addEventListener("prerenderingchange",ge,!0)},Ee=function(){
removeEventListener("visibilitychange",ge,!0),removeEventListener("prerenderingchange",ge,!0)},ke=function(){
return ye<0&&(ye=ve(),Ae(),ue(function(){
setTimeout(function(){
ye=ve(),Ae()},0)})),{
get firstHiddenTime(){
return ye}}},Pe=function(t){
document.prerendering?addEventListener("prerenderingchange",function(){
return t()},!0):t()},Ce=[1800,3e3],Se=function(t,n){
n=n||{},Pe(function(){
var e,i=ke(),o=fe("FCP"),r=he("paint",function(t){
t.forEach(function(t){"first-contentful-paint"===t.name&&(r.disconnect(),t.startTime<i.firstHiddenTime&&(o.value=Math.max(t.startTime-de(),0),o.entries.push(t),e(!0)))})});r&&(e=pe(t,o,Ce,n.reportAllChanges),ue(function(i){
o=fe("FCP"),e=pe(t,o,Ce,n.reportAllChanges),me(function(){
o.value=performance.now()-i.timeStamp,e(!0)})}))})},Te=[.1,.25],Le=function(t,n){
n=n||{},Se(be(function(){
var e,i=fe("CLS",0),o=0,r=[],a=function(t){
t.forEach(function(t){
if(!t.hadRecentInput){
var n=r[0],e=r[r.length-1];o&&t.startTime-e.startTime<1e3&&t.startTime-n.startTime<5e3?(o+=t.value,r.push(t)):(o=t.value,r=[t])}}),o>i.value&&(i.value=o,i.entries=r,e())},s=he("layout-shift",a);s&&(e=pe(t,i,Te,n.reportAllChanges),we(function(){
a(s.takeRecords()),e(!0)}),ue(function(){
o=0,i=fe("CLS",0),e=pe(t,i,Te,n.reportAllChanges),me(function(){
return e()})}),setTimeout(e,0))}))},Ie={
passive:!0,capture:!0},Oe=new Date,Me=function(t,n){
ie||(ie=n,oe=t,re=new Date,$e(removeEventListener),xe())},xe=function(){
if(oe>=0&&oe<re-Oe){
var t={
entryType:"first-input",name:ie.type,target:ie.target,cancelable:ie.cancelable,startTime:ie.timeStamp,processingStart:ie.timeStamp+oe};ae.forEach(function(n){
n(t)}),ae=[]}},Re=function(t){
if(t.cancelable){
var n=(t.timeStamp>1e12?new Date:performance.now())-t.timeStamp;"pointerdown"==t.type?(e=n,i=t,o=function(){
Me(e,i),a()},r=function(){
a()},a=function(){
removeEventListener("pointerup",o,Ie),removeEventListener("pointercancel",r,Ie)},addEventListener("pointerup",o,Ie),addEventListener("pointercancel",r,Ie)):Me(n,t)}
var e,i,o,r,a},$e=function(t){["mousedown","keydown","touchstart","pointerdown"].forEach(function(n){
return t(n,Re,Ie)})},_e=[100,300],Fe=function(t,n){
n=n||{},Pe(function(){
var e,i=ke(),o=fe("FID"),r=function(t){
t.startTime<i.firstHiddenTime&&(o.value=t.processingStart-t.startTime,o.entries.push(t),e(!0))},a=function(t){
t.forEach(r)},s=he("first-input",a);e=pe(t,o,_e,n.reportAllChanges),s&&we(be(function(){
a(s.takeRecords()),s.disconnect()})),s&&ue(function(){
var i;o=fe("FID"),e=pe(t,o,_e,n.reportAllChanges),ae=[],oe=-1,ie=null,$e(addEventListener),i=r,ae.push(i),xe()})})},Ue=0,Be=1/0,Ne=0,je=function(t){
t.forEach(function(t){
t.interactionId&&(Be=Math.min(Be,t.interactionId),Ne=Math.max(Ne,t.interactionId),Ue=Ne?(Ne-Be)/7+1:0)})},De=function(){
return se?Ue:performance.interactionCount||0},qe=[200,500],We=0,Ve=function(){
return De()-We},ze=[],Ge={},He=function(t){
var n=ze[ze.length-1],e=Ge[t.interactionId];
if(e||ze.length<10||t.duration>n.latency){
if(e)e.entries.push(t),e.latency=Math.max(e.latency,t.duration);else{
var i={
id:t.interactionId,latency:t.duration,entries:[t]};Ge[i.id]=i,ze.push(i)}
ze.sort(function(t,n){
return n.latency-t.latency}),ze.splice(10).forEach(function(t){
delete Ge[t.id]})}},Ke=function(t,n){
n=n||{},Pe(function(){
var e;"interactionCount"in performance||se||(se=he("event",je,{
type:"event",buffered:!0,durationThreshold:0}));
var i,o=fe("INP"),r=function(t){
t.forEach(function(t){
t.interactionId&&He(t),"first-input"===t.entryType&&!ze.some(function(n){
return n.entries.some(function(n){
return t.duration===n.duration&&t.startTime===n.startTime})})&&He(t)});
var n,e=(n=Math.min(ze.length-1,Math.floor(Ve()/50)),ze[n]);e&&e.latency!==o.value&&(o.value=e.latency,o.entries=e.entries,i())},a=he("event",r,{
durationThreshold:null!==(e=n.durationThreshold)&&void 0!==e?e:40});i=pe(t,o,qe,n.reportAllChanges),a&&("PerformanceEventTiming"in window&&"interactionId"in PerformanceEventTiming.prototype&&a.observe({
type:"first-input",buffered:!0}),we(function(){
r(a.takeRecords()),o.value<0&&Ve()>0&&(o.value=0,o.entries=[]),i(!0)}),ue(function(){
ze=[],We=De(),o=fe("INP"),i=pe(t,o,qe,n.reportAllChanges)}))})},Xe=[2500,4e3],Je={},Ye=function(t,n){
n=n||{},Pe(function(){
var e,i=ke(),o=fe("LCP"),r=function(t){
var n=t[t.length-1];n&&n.startTime<i.firstHiddenTime&&(o.value=Math.max(n.startTime-de(),0),o.entries=[n],e())},a=he("largest-contentful-paint",r);
if(a){
e=pe(t,o,Xe,n.reportAllChanges);
var s=be(function(){
Je[o.id]||(r(a.takeRecords()),a.disconnect(),Je[o.id]=!0,e(!0))});["keydown","click"].forEach(function(t){
addEventListener(t,function(){
return setTimeout(s,0)},!0)}),we(s),ue(function(i){
o=fe("LCP"),e=pe(t,o,Xe,n.reportAllChanges),me(function(){
o.value=performance.now()-i.timeStamp,Je[o.id]=!0,e(!0)})})}})},Qe=[800,1800],Ze=function t(n){
document.prerendering?Pe(function(){
return t(n)}):"complete"!==document.readyState?addEventListener("load",function(){
return t(n)},!0):setTimeout(n,0)},ti=function(t,n){
n=n||{};
var e=fe("TTFB"),i=pe(t,e,Qe,n.reportAllChanges);Ze(function(){
var o=le();
if(o){
var r=o.responseStart;
if(r<=0||r>performance.now())return;e.value=Math.max(r-de(),0),e.entries=[o],i(!0),ue(function(){
e=fe("TTFB",0),(i=pe(t,e,Qe,n.reportAllChanges))(!0)})}})};
const ni={__proto__:null,CLSThresholds:Te,FCPThresholds:Ce,FIDThresholds:_e,INPThresholds:qe,LCPThresholds:Xe,TTFBThresholds:Qe,getCLS:Le,getFCP:Se,getFID:Fe,getINP:Ke,getLCP:Ye,getTTFB:ti,onCLS:Le,onFCP:Se,onFID:Fe,onINP:Ke,onLCP:Ye,onTTFB:ti}}();