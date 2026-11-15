import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
      && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/'
  } catch {
    return false
  }
}

function readLocalEnv(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) return []
    return [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]]
  }))
}

export function checkLocalEnvironment(root = process.cwd()) {
  const issues = []
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', timeout: 10000 })
  if (branch.status !== 0 || branch.stdout.trim() !== 'staging') {
    issues.push('Selecciona la rama staging antes de iniciar este entorno local.')
  }
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 10000 })
  if (docker.status !== 0) issues.push('Falta un motor compatible con Docker instalado y en ejecucion.')
  const env = Object.assign({}, ...['.env', '.env.local', '.env.development', '.env.development.local'].map((name) => readLocalEnv(resolve(root, name))), process.env)
  if (!isLocalSupabaseUrl(env.VITE_SUPABASE_URL)) {
    issues.push('VITE_SUPABASE_URL debe apuntar a localhost o 127.0.0.1. Se bloquea cualquier base remota.')
  }
  if (!env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY === 'COPIAR_LA_CLAVE_PUBLICA_DEL_SUPABASE_LOCAL') {
    issues.push('Falta la clave publica de la instancia local en .env.local.')
  }
  if (!existsSync(resolve(root, 'supabase/local-test/baseline.sql'))) {
    issues.push('Falta el esquema inicial revisado en supabase/local-test/baseline.sql. Las migraciones historicas no bastan para crear la base desde cero.')
  }
  return issues
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = checkLocalEnvironment()
  if (issues.length) {
    console.error('Entorno local NO preparado:')
    for (const issue of issues) console.error('- ' + issue)
    process.exitCode = 1
  } else {
    console.log('Requisitos locales comprobados. Este resultado no sustituye la prueba de conexion, permisos y guardado en la base local.')
  }
}
