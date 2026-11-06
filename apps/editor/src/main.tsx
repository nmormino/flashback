import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import { editorActions, getEditorState, useEditorStore } from './state/editorStore';

if (typeof window !== 'undefined') {
  (window as any).editorActions = editorActions;
  (window as any).getEditorState = getEditorState;
  (window as any).useEditorStore = useEditorStore;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find #root element in document');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
