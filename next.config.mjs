/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 申請書類作成フォームのテンプレ(.xlsx)は実行時に fs で読むため、
  // ビルドのファイルトレースに含めないと本番で見つからない。
  outputFileTracingIncludes: {
    '/api/applications/[caseId]/template': ['./lib/portal/templates/**'],
  },
  env: {
    ALLOW_LEGACY_IMPORTS: 'false',
    IMPORTS_DISABLED_UNTIL_MAPPING_ACTIVE: 'true',
  },
}

export default nextConfig
