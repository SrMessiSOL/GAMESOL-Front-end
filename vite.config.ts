import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

function cryptoUfosGateway(env: Record<string, string>) {
  const require = createRequire(import.meta.url)
  const { createService } = require('./server/crypto-ufos.cjs')
  let service: ReturnType<typeof createService>
  return {
    name: 'gamesol-crypto-ufos-api',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any) => void) => void } }) {
      server.middlewares.use('/api/crypto-ufos', (req, res) => {
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed.' })); return }
        try {
          if (new URL(req.headers.origin).host !== req.headers.host) throw new Error()
        } catch { res.statusCode = 403; res.end(JSON.stringify({ error: 'Use the game website to link your wallet.' })); return }
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 16000) chunks.push(chunk) })
        req.on('end', () => {
          if (size > 16000) { res.statusCode = 413; res.end(JSON.stringify({ error: 'Request too large.' })); return }
          void (async () => {
            service ||= createService({ env })
            const value = await service(JSON.parse(Buffer.concat(chunks).toString()), new URL(req.headers.origin).origin)
            res.end(JSON.stringify(value))
          })().catch((error: unknown) => {
            res.statusCode = 503
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'NFT service unavailable.' }))
          })
        })
      })
    },
  }
}

function resilientRpcGateway(target: URL, maxConcurrent: number) {
  let active = 0
  let sequence = 0
  let throttledUntil = 0
  const queue: Array<{ priority: number; sequence: number; run: () => void }> = []

  const drain = () => {
    const currentLimit = Date.now() < throttledUntil ? 1 : maxConcurrent
    queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
    while (active < currentLimit && queue.length > 0) queue.shift()!.run()
  }

  const schedule = <T,>(operation: () => Promise<T>, priority: number) => new Promise<T>((resolvePromise, rejectPromise) => {
    const run = () => {
      active += 1
      void operation().then(resolvePromise, rejectPromise).finally(() => {
        active -= 1
        drain()
      })
    }
    queue.push({ priority, sequence: sequence++, run })
    drain()
  })

  const install = (server: { middlewares: { use: (path: string, handler: (req: any, res: any) => void) => void } }) => {
    server.middlewares.use('/api/solana-rpc', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }
      const chunks: Uint8Array[] = []
      req.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let method = ''
        try {
          const parsedRequest = JSON.parse(body)
          method = Array.isArray(parsedRequest) ? '' : String(parsedRequest?.method || '')
        } catch {
          method = ''
        }
        const priority = method === 'sendTransaction'
          ? 0
          : ['getSignaturesForAddress', 'getTransaction', 'getTransactions', 'getBlock', 'getBlocks'].includes(method)
            ? 2
            : 1
        void schedule(async () => {
          let lastStatus = 429
          let lastContentType = 'application/json'
          let lastBody = JSON.stringify({ jsonrpc: '2.0', error: { code: 429, message: 'Devnet is busy. Please retry.' }, id: null })
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const upstream = await fetch(target, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            })
            lastStatus = upstream.status
            lastContentType = upstream.headers.get('content-type') || 'application/json'
            lastBody = await upstream.text()
            let jsonRateLimited = false
            try {
              const parsed = JSON.parse(lastBody)
              const entries = Array.isArray(parsed) ? parsed : [parsed]
              jsonRateLimited = entries.some(entry => entry?.error?.code === 429 || /rate limit|too many requests/i.test(entry?.error?.message || ''))
            } catch {
              jsonRateLimited = false
            }
            if (upstream.status !== 429 && !jsonRateLimited) break
            throttledUntil = Math.max(throttledUntil, Date.now() + 15_000)
            if (attempt < 5) await new Promise(resolveDelay => setTimeout(resolveDelay, Math.min(8_000, 700 * (2 ** attempt))))
          }
          res.statusCode = lastStatus
          res.setHeader('content-type', lastContentType)
          res.setHeader('cache-control', 'no-store')
          res.end(lastBody)
        }, priority).catch((error: unknown) => {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: error instanceof Error ? error.message : 'RPC gateway failed' }, id: null }))
        })
      })
    })
  }

  return {
    name: 'gamesol-resilient-rpc-gateway',
    configureServer: install,
    configurePreviewServer: install,
  }
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, __dirname, '')
  const nftEnv = { ...loadEnv('nft.server', __dirname, ''), ...serverEnv, ...process.env } as Record<string, string>
  const heliusApiKey = (process.env.HELIUS_API_KEY || serverEnv.HELIUS_API_KEY)?.trim()
  const privateRpcTarget = (
    process.env.GAMESOL_RPC_PROXY_TARGET
    || serverEnv.GAMESOL_RPC_PROXY_TARGET
    || (heliusApiKey ? `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}` : '')
  ).trim()
  const rpcUrl = new URL(privateRpcTarget || 'https://api.devnet.solana.com')
  const wsUrl = new URL(rpcUrl.toString().replace(/^https:/, 'wss:').replace(/^http:/, 'ws:'))

  return {
    plugins: [react(), resilientRpcGateway(rpcUrl, privateRpcTarget ? 6 : 2), cryptoUfosGateway(nftEnv)],
    assetsInclude: ['**/*.glb'],
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api/solana-ws': {
          target: wsUrl.origin,
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: () => `${wsUrl.pathname}${wsUrl.search}`,
        },
      },
    },
    resolve: {
      alias: {
        buffer: 'buffer/',
        process: 'process/browser',
        // LazorKit 2.1 imports Node createHash in its browser entrypoint.
        // Keep the shim intentionally limited to the SHA-256 API it uses.
        crypto: resolve(__dirname, 'src/crypto-browser.ts'),
      },
    },
    define: {
      global: 'globalThis',
      'import.meta.env.VITE_SOLANA_RPC_ENDPOINT': JSON.stringify('/api/solana-rpc'),
      'import.meta.env.VITE_SOLANA_WS_ENDPOINT': JSON.stringify('/api/solana-ws'),
      'import.meta.env.VITE_RPC_SHARED_PUBLIC': JSON.stringify(privateRpcTarget ? 'false' : 'true'),
    },
    optimizeDeps: {
      include: ['buffer', 'process'],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
  }
})
