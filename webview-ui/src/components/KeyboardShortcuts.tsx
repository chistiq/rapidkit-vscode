import { Keyboard } from 'lucide-react';

export function KeyboardShortcuts() {
  const shortcuts = [
    { keys: ['Ctrl+Shift+R', 'W'], description: 'New Workspace' },
    { keys: ['Ctrl+Shift+R', 'P'], description: 'New Project' },
    { keys: ['Ctrl+Shift+R', 'M'], description: 'Add Module' },
    { keys: ['Ctrl+Shift+R', 'D'], description: 'AI Debugger' },
  ];

  return (
    <div className="section">
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Keyboard size={18} style={{ color: '#6C5CE7' }} />
        Shortcut Reference
      </div>
      <div className="shortcuts">
        {shortcuts.map((shortcut, index) => (
          <div key={index} className="shortcut">
            {shortcut.keys.map((key, keyIndex) => (
              <span key={keyIndex} className="kbd">
                {key}
              </span>
            ))}
            <span className="shortcut-desc">{shortcut.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
