
export const SetupPage = () => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    justifyContent: 'center', 
    height: '100vh',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  }}>
    <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Welcome to Zine</h1>
    <p style={{ marginBottom: '2rem', textAlign: 'center', maxWidth: '600px' }}>
      To get started, you need to set up your Clerk authentication key.
    </p>
    <div style={{ 
      background: '#f3f4f6', 
      padding: '20px', 
      borderRadius: '8px',
      maxWidth: '600px',
      width: '100%'
    }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Setup Instructions:</h2>
      <ol style={{ lineHeight: '1.8' }}>
        <li>Create an account at <a href="https://clerk.com" target="_blank" rel="noopener noreferrer">clerk.com</a></li>
        <li>Create a new application in your Clerk dashboard</li>
        <li>Copy your publishable key</li>
        <li>Create a file <code style={{ background: '#e5e7eb', padding: '2px 4px', borderRadius: '3px' }}>apps/web/.env.local</code></li>
        <li>Add this line: <code style={{ background: '#e5e7eb', padding: '2px 4px', borderRadius: '3px' }}>VITE_CLERK_PUBLISHABLE_KEY_DEV=your_key_here</code></li>
        <li>Restart the development server</li>
      </ol>
    </div>
  </div>
);