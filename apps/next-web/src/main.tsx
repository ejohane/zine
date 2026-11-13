import { createRoot } from 'react-dom/client';
import { ConnectedApp } from './LiveApp';
import './styles.css';
createRoot(document.getElementById('root')!).render(<ConnectedApp />);
