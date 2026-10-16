const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawn} = require('node:child_process');
const repository = 'Cristiant2608/mirros';
const api = `https://api.github.com/repos/${repository}`;
const headers = {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Mirros-updates'};

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  return match ? match.slice(1).map(Number) : null;
}
function newer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseAsset(release, platform, arch = process.arch) {
  const version = versionParts(release.tag_name)?.join('.');
  if (!version || release.draft || release.prerelease || arch !== 'x64') return null;
  const name = platform === 'win32' ? `Mirros-${version}-Windows.exe` : platform === 'linux' ? `Mirros-${version}-Linux-x64.AppImage` : '';
  const asset = release.assets?.find(item => item.name === name);
  if (!asset || !/^sha256:[a-f\d]{64}$/i.test(asset.digest || '')) return null;
  const url = new URL(asset.browser_download_url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`)) return null;
  if (!(asset.size > 0 && asset.size <= 1024 * 1024 * 1024)) return null;
  return {...asset, version, hash: asset.digest.slice(7).toLowerCase()};
}
async function checkUpdates({version, platform = process.platform, arch = process.arch, fetchRequest = fetch}) {
  const response = await fetchRequest(`${api}/releases/latest`, {headers, signal:AbortSignal.timeout(15000)});
  if (response.status === 404) return {phase:'sin-publicacion',message:'Todavía no hay una versión publicada para descargar.'};
  if (!response.ok) throw new Error(response.status === 403 ? 'GitHub limitó temporalmente las consultas. Inténtalo más tarde.' : 'No se pudieron consultar las actualizaciones.');
  const release = await response.json();
  if (!newer(release.tag_name, version)) return {phase:'actualizado',message:`Tienes la versión ${version}.`,version};
  const asset = releaseAsset(release, platform, arch);
  if (!asset) return {phase:'pendiente',message:'Hay una versión nueva, pero falta un paquete verificable para este sistema.',version:release.tag_name};
  return {phase:'disponible',message:`Disponible Mirros ${asset.version}.`,version:asset.version,asset,notes:typeof release.body === 'string' ? release.body.slice(0,12000) : ''};
}
async function downloadUpdate(asset, directory, {fetchRequest = fetch, onProgress = () => {}} = {}) {
  await fs.mkdir(directory,{recursive:true});
  const file = path.join(directory,'mirros-update.download');
  const response = await fetchRequest(asset.browser_download_url,{headers,signal:AbortSignal.timeout(30*60*1000)});
  if (!response.ok || !response.body) throw new Error('No se pudo descargar la actualización.');
  const digest = createHash('sha256');let size = 0;
  const handle = await fs.open(file,'w');
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > asset.size || size > 1024*1024*1024) throw new Error('La descarga tiene un tamaño inesperado.');
      digest.update(chunk); await handle.writeFile(chunk);onProgress(Math.floor(size / asset.size * 100));
    }
    if (size !== asset.size || digest.digest('hex') !== asset.hash) throw new Error('La verificación de la descarga falló. No se instalará.');
  } catch(error) { await handle.close();await fs.rm(file,{force:true});throw error; }
  await handle.close();return file;
}
function portableTarget(platform, env = process.env) {
  const target = platform === 'win32' ? env.PORTABLE_EXECUTABLE_FILE : platform === 'linux' ? env.APPIMAGE : null;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (!target || !paths.isAbsolute(target) || !(platform === 'win32' ? /\.exe$/i : /\.AppImage$/).test(target)) return null;
  return paths.normalize(target);
}
const psQuote = value => "'" + value.replaceAll("'","''") + "'";
const shQuote = value => "'" + value.replaceAll("'","'\\''") + "'";
function installerScript({platform,target,download,pid,log}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Proceso de actualización no válido.');
  if (platform === 'win32') return `$ErrorActionPreference='Stop'
$target=${psQuote(target)}
$download=${psQuote(download)}
$backup=$target+'.mirros-previous'
$limit=(Get-Date).AddSeconds(90)
while(Get-Process -Id ${pid} -ErrorAction SilentlyContinue){if((Get-Date)-gt $limit){exit 1};Start-Sleep -Milliseconds 500}
try {
  if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}
  Move-Item -LiteralPath $target -Destination $backup
  try {Copy-Item -LiteralPath $download -Destination $target;Start-Process -FilePath $target -WindowStyle Hidden}
  catch {if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};Move-Item -LiteralPath $backup -Destination $target;throw}
} catch {$_ | Out-File -LiteralPath ${psQuote(log)} -Encoding utf8}
`;
  if (platform !== 'linux') throw new Error('Actualización no disponible en este sistema.');
  return `#!/bin/sh
target=${shQuote(target)}
download=${shQuote(download)}
backup="$target.mirros-previous"
count=0
while kill -0 ${pid} 2>/dev/null; do count=$((count+1)); [ "$count" -lt 180 ] || exit 1; sleep .5; done
exec 2>${shQuote(log)}
cp -- "$download" "$target.mirros-new" || exit 1
chmod +x "$target.mirros-new" || exit 1
mv -f -- "$target" "$backup" || exit 1
if mv -- "$target.mirros-new" "$target"; then "$target" >/dev/null 2>&1 &
else mv -- "$backup" "$target"; exit 1; fi
`;
}
async function prepareInstaller({platform = process.platform, target, download, directory, pid = process.pid}) {
  if (portableTarget(platform,platform === 'win32' ? {PORTABLE_EXECUTABLE_FILE:target} : {APPIMAGE:target}) !== target) throw new Error('Abre el EXE portátil o el AppImage para actualizar esta copia.');
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('El ejecutable debe ser un archivo normal.');
  await fs.access(target,fs.constants.W_OK);
  await fs.access(path.dirname(target),fs.constants.W_OK);
  const file = path.join(directory,platform === 'win32' ? 'install-update.ps1' : 'install-update.sh');
  await fs.writeFile(file,(platform === 'win32' ? '\uFEFF' : '') + installerScript({platform,target,download,pid,log:path.join(directory,'install-update.log')}),'utf8');
  return () => {
    const command = platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = platform === 'win32' ? ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file] : [file];
    const child = spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});
    child.on('error',()=>{});child.unref();
  };
}
module.exports = {newer,releaseAsset,checkUpdates,downloadUpdate,portableTarget,installerScript,prepareInstaller};
