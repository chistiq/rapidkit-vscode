import { BookOpen, Github, Star } from 'lucide-react';

declare const vscode: any;

export function Footer() {
  const openDocs = () => {
    vscode.postMessage('openDocs');
  };

  const openGitHub = () => {
    vscode.postMessage('openGitHub');
  };

  const openMarketplace = () => {
    vscode.postMessage('openMarketplace');
  };

  return (
    <div className="footer">
      <div className="footer-links">
        <a className="footer-link" onClick={openDocs}>
          <BookOpen size={14} />
          Documentation
        </a>
        <a className="footer-link" onClick={openGitHub}>
          <Github size={14} />
          GitHub
        </a>
        <a className="footer-link" onClick={openMarketplace}>
          <Star size={14} />
          Rate Extension
        </a>
      </div>
      <div className="copyright">Workspai · Open source by Chistiq</div>
    </div>
  );
}
