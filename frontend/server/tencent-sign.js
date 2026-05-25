import crypto from 'crypto'

function sha256(message, secret = '', encoding = 'hex') {
  const hmac = crypto.createHmac('sha256', secret)
  return hmac.update(message).digest(encoding)
}

function getHash(message, encoding = 'hex') {
  const hash = crypto.createHash('sha256')
  return hash.update(message).digest(encoding)
}

function getDate(timestamp) {
  const date = new Date(timestamp * 1000)
  return date.toISOString().slice(0, 10)
}

/**
 * 腾讯云 API 3.0 TC3-HMAC-SHA256 签名
 * @see https://cloud.tencent.com/document/product/1804/120833
 */
export function signTencentRequest({
  secretId,
  secretKey,
  service = 'ai3d',
  region = 'ap-guangzhou',
  action,
  version = '2025-05-13',
  payload = {},
}) {
  const host = `${service}.tencentcloudapi.com`
  const timestamp = Math.floor(Date.now() / 1000)
  const date = getDate(timestamp)

  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const payloadStr = JSON.stringify(payload)
  const hashedRequestPayload = getHash(payloadStr)
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = getHash(canonicalRequest)
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  const kDate = sha256(date, `TC3${secretKey}`)
  const kService = sha256(service, kDate)
  const kSigning = sha256('tc3_request', kService)
  const signature = sha256(stringToSign, kSigning)

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: `https://${host}`,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payloadStr,
  }
}
