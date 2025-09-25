import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, X, Send } from 'lucide-react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

interface HistoryItem {
  method: string
  url: string
  status: number
  time: number
  timestamp: Date
}

interface Header {
  key: string
  value: string
}



const API_ENDPOINTS = {
  bookmarks: [
    { method: 'GET', path: '/api/v1/bookmarks', label: '/bookmarks' },
    { method: 'GET', path: '/api/v1/bookmarks/{id}', label: '/bookmarks/{id}' },
    { method: 'POST', path: '/api/v1/bookmarks', label: '/bookmarks', body: '{"url":"","title":"","description":""}' },
    { method: 'DELETE', path: '/api/v1/bookmarks/{id}', label: '/bookmarks/{id}' },
  ],
  user: [
    { method: 'GET', path: '/api/v1/users/me', label: '/users/me' },
    { method: 'GET', path: '/api/v1/users/me/stats', label: '/users/me/stats' },
  ],
  feeds: [
    { method: 'GET', path: '/api/v1/feeds', label: '/feeds' },
    { method: 'POST', path: '/api/v1/feeds/subscribe', label: '/feeds/subscribe', body: '{"url":"","platform":""}' },
  ],
  oauth: [
    { method: 'GET', path: '/api/v1/auth/spotify/authorize', label: '/auth/spotify' },
    { method: 'GET', path: '/api/v1/auth/youtube/authorize', label: '/auth/youtube' },
  ],
}

export default function ApiDebugger() {
  const { getToken, isSignedIn } = useAuth()
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('http://localhost:8787/api/v1/bookmarks')
  const [headers, setHeaders] = useState<Header[]>([{ key: 'Content-Type', value: 'application/json' }])
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<unknown>(null)
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({})
  const [responseTime, setResponseTime] = useState<number | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('body')

  useEffect(() => {
    if (response && typeof response === 'object') {
      setTimeout(() => {
        const elements = document.querySelectorAll('.hljs')
        elements.forEach((el) => {
          hljs.highlightElement(el as HTMLElement)
        })
      }, 0)
    }
  }, [response, activeTab])

  const sendRequest = async () => {
    setLoading(true)
    const startTime = performance.now()

    try {
      const requestHeaders: Record<string, string> = {}
      headers.forEach((h) => {
        if (h.key && h.value) {
          requestHeaders[h.key] = h.value
        }
      })

      if (isSignedIn) {
        const token = await getToken()
        if (token) {
          requestHeaders['Authorization'] = `Bearer ${token}`
        }
      }

      const options: RequestInit = {
        method,
        headers: requestHeaders,
      }

      if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
        options.body = body
      }

      const res = await fetch(url, options)
      const endTime = performance.now()
      const time = Math.round(endTime - startTime)

      setStatus(res.status)
      setResponseTime(time)

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })
      setResponseHeaders(resHeaders)

      const contentType = res.headers.get('content-type')
      let responseData
      if (contentType?.includes('application/json')) {
        responseData = await res.json()
      } else {
        responseData = await res.text()
      }
      setResponse(responseData)

      const historyItem: HistoryItem = {
        method,
        url,
        status: res.status,
        time,
        timestamp: new Date(),
      }
      setHistory((prev) => [historyItem, ...prev.slice(0, 19)])
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      setResponse({ error: errorMessage })
      setStatus(0)
    } finally {
      setLoading(false)
    }
  }

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }])
  }

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers]
    newHeaders[index][field] = value
    setHeaders(newHeaders)
  }

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index))
  }

  const selectEndpoint = (endpoint: { method: string; path: string; body?: string }) => {
    setMethod(endpoint.method)
    setUrl(`http://localhost:8787${endpoint.path}`)
    if (endpoint.body) {
      setBody(endpoint.body)
    }
  }

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-green-500',
      POST: 'text-yellow-500',
      PUT: 'text-blue-500',
      PATCH: 'text-purple-500',
      DELETE: 'text-red-500',
    }
    return colors[method] || 'text-gray-500'
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🔧 API Debugger</h1>
        <p className="text-gray-600 dark:text-gray-400">Test your API endpoints locally</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-4">API Endpoints</h2>
            
            {Object.entries(API_ENDPOINTS).map(([category, endpoints]) => (
              <div key={category} className="mb-4">
                <h3 className="text-xs uppercase text-gray-500 mb-2">{category}</h3>
                <div className="space-y-1">
                  {endpoints.map((endpoint, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectEndpoint(endpoint)}
                      className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <span className={`font-mono text-xs ${getMethodColor(endpoint.method)}`}>
                        {endpoint.method}
                      </span>
                      <span className="text-sm">{endpoint.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Request Builder */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Request</h2>

            <div className="flex gap-2 mb-4">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-32 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL"
                className="flex-1 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 dark:border-gray-700"
              />
              
              <Button onClick={sendRequest} disabled={loading}>
                <Send className="w-4 h-4 mr-2" />
                {loading ? 'Sending...' : 'Send'}
              </Button>
            </div>

            {/* Headers */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">Headers</label>
                <Button size="sm" variant="ghost" onClick={addHeader}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Header
                </Button>
              </div>
              <div className="space-y-2">
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      placeholder="Key"
                      value={header.key}
                      onChange={(e) => updateHeader(index, 'key', e.target.value)}
                      className="flex-1 px-3 py-1 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <input
                      placeholder="Value"
                      value={header.value}
                      onChange={(e) => updateHeader(index, 'value', e.target.value)}
                      className="flex-1 px-3 py-1 border rounded-md text-sm bg-white dark:bg-gray-800 dark:border-gray-700"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeHeader(index)}
                      className="px-2"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            {['POST', 'PUT', 'PATCH'].includes(method) && (
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400 block mb-2">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="w-full px-3 py-2 border rounded-md font-mono min-h-[128px] bg-white dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            )}
          </Card>

          {/* Response */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Response</h2>
              {status !== null && (
                <div className="flex items-center gap-4">
                  <Badge variant={status < 400 ? 'default' : 'destructive'}>
                    {status} {status === 0 ? 'Error' : ''}
                  </Badge>
                  {responseTime !== null && (
                    <span className="text-sm text-gray-500">{responseTime}ms</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="flex border-b dark:border-gray-700">
                <button
                  className={`px-4 py-2 text-sm ${activeTab === 'body' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
                  onClick={() => setActiveTab('body')}
                >
                  Body
                </button>
                <button
                  className={`px-4 py-2 text-sm ${activeTab === 'headers' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
                  onClick={() => setActiveTab('headers')}
                >
                  Headers
                </button>
                <button
                  className={`px-4 py-2 text-sm ${activeTab === 'raw' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}
                  onClick={() => setActiveTab('raw')}
                >
                  Raw
                </button>
              </div>

              <div className="mt-4">
                {activeTab === 'body' && (
                  <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
                    {response ? (
                      <pre>
                        <code className="hljs language-json text-sm">
                          {typeof response === 'object'
                            ? JSON.stringify(response, null, 2)
                            : String(response)}
                        </code>
                      </pre>
                    ) : (
                      <p className="text-gray-400">No response yet. Send a request to see the response here.</p>
                    )}
                  </div>
                )}

                {activeTab === 'headers' && (
                  <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
                    <pre>
                      <code className="hljs language-json text-sm">
                        {JSON.stringify(responseHeaders, null, 2)}
                      </code>
                    </pre>
                  </div>
                )}

                {activeTab === 'raw' && (
                  <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
                    <pre className="text-sm text-gray-300">
                      {status && `HTTP/1.1 ${status}\n`}
                      {Object.entries(responseHeaders)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n')}
                      {'\n\n'}
                      {response ? (
                        typeof response === 'object'
                          ? JSON.stringify(response, null, 2)
                          : String(response)
                      ) : null}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* History */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">History</h2>
            <div className="space-y-2 max-h-60 overflow-auto">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500">No requests yet</p>
              ) : (
                history.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setMethod(item.method)
                      setUrl(item.url)
                    }}
                    className="w-full flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono ${getMethodColor(item.method)}`}>
                        {item.method}
                      </span>
                      <span className="text-sm truncate max-w-xs">
                        {item.url.replace('http://localhost:8787', '')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${item.status < 400 ? 'text-green-500' : 'text-red-500'}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-500">{item.time}ms</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}