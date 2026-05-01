function parseToolPayload(value: unknown) {
  if (!value) return undefined
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function formatNumber(value: unknown, digits = 1) {
  return Number(value).toFixed(digits)
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.5rem', borderRadius: 10, background: '#fff' }}>
      <div style={{ color: '#666', fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  )
}

export function ToolWidget({ toolName, input, output }: { toolName: string; input: unknown; output: unknown }) {
  const result = parseToolPayload(output)
  const args = parseToolPayload(input)

  if (!result) {
    return args ? <div style={{ color: '#555', fontSize: 13 }}>Input: {JSON.stringify(args)}</div> : null
  }

  if (toolName === 'get_weather') {
    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{String(result.city)}</div>
            <div style={{ color: '#555' }}>{String(result.condition)}</div>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{formatNumber(result.temperatureC, 0)}°C</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
          <Metric label="Humidity" value={`${formatNumber(result.humidity, 0)}%`} />
          <Metric label="Wind" value={`${formatNumber(result.windKph, 0)} km/h`} />
        </div>
      </div>
    )
  }

  if (toolName === 'get_stock_quote') {
    const change = Number(result.change)
    const isUp = change >= 0

    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{String(result.symbol)}</div>
            <div style={{ color: '#555' }}>{String(result.marketState)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{String(result.currency)} {formatNumber(result.price, 2)}</div>
            <div style={{ color: isUp ? '#147a35' : 'crimson', fontWeight: 700 }}>
              {isUp ? '▲' : '▼'} {formatNumber(Math.abs(change), 2)} ({formatNumber(Math.abs(Number(result.changePercent)), 2)}%)
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (toolName === 'brave_web_search') {
    const results = result.results as Array<unknown>

    return (
      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Results for “{String(result.query)}”</div>
        {results.map((item, index) => {
          const searchResult = item as Record<string, unknown>
          const url = String(searchResult.url)

          return (
            <a
              key={`${url}-${index}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'grid',
                gap: 2,
                padding: '0.55rem',
                borderRadius: 10,
                background: '#fff',
                color: '#111',
                textDecoration: 'none',
              }}
            >
              <strong>{String(searchResult.title)}</strong>
              <span style={{ color: '#555', fontSize: 13 }}>{String(searchResult.description)}</span>
              <span style={{ color: '#777', fontSize: 12 }}>{url}</span>
            </a>
          )
        })}
      </div>
    )
  }

  return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result)}</pre>
}
