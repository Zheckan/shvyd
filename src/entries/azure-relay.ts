import { createManagedAzureHandler } from '@/features/managed-azure/createManagedAzureHandler'

type RelayEnvironment = {
  AZURE_TRANSLATOR_KEY: string
  AZURE_TRANSLATOR_REGION?: string
  ALLOWED_EXTENSION_ORIGINS: string
  REQUEST_LIMITER: {
    limit: (value: { key: string }) => Promise<{ success: boolean }>
  }
}

export default {
  async fetch(request: Request, env: RelayEnvironment): Promise<Response> {
    const handle = createManagedAzureHandler({
      key: env.AZURE_TRANSLATOR_KEY,
      region: env.AZURE_TRANSLATOR_REGION ?? '',
      allowedOrigins: env.ALLOWED_EXTENSION_ORIGINS.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      allowRequest: async (request) => {
        const identity = request.headers.get('cf-connecting-ip')

        if (!identity) {
          return false
        }

        return (await env.REQUEST_LIMITER.limit({ key: identity })).success
      },
    })

    return handle(request)
  },
}
