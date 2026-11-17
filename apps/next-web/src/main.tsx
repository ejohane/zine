import { createRoot } from 'react-dom/client';
import { ConnectedApp } from './LiveApp';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/source-serif-4/opsz.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(<ConnectedApp />);
