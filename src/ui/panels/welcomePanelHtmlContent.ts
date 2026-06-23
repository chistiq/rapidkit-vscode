import * as vscode from 'vscode';

import { buildReactWebviewHtml } from '../webviews/buildReactWebviewHtml';

export function buildWelcomePanelHtmlContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
  const asUri = (...segments: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, ...segments));

  const iconUri = asUri('media', 'icons', 'workspai.svg');
  const fontUri = asUri('media', 'fonts', 'MuseoModerno-Bold.ttf');
  const fastapiIconUri = asUri('media', 'icons', 'fastapi.svg');
  const nestjsIconUri = asUri('media', 'icons', 'nestjs.svg');
  const goIconUri = asUri('media', 'icons', 'go.svg');
  const springbootIconUri = asUri('media', 'icons', 'springboot.svg');
  const dotnetIconUri = asUri('media', 'icons', 'dotnet.svg');

  const headExtras = `<style>
        @font-face {
            font-family: 'MuseoModerno';
            src: url('${fontUri}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }

        /* Inject icon URIs as CSS variables */
        :root {
            --icon-uri: url('${iconUri}');
            --fastapi-icon-uri: url('${fastapiIconUri}');
            --nestjs-icon-uri: url('${nestjsIconUri}');
            --go-icon-uri: url('${goIconUri}');
          --springboot-icon-uri: url('${springbootIconUri}');
          --dotnet-icon-uri: url('${dotnetIconUri}');
        }
    </style>`;

  return buildReactWebviewHtml({
    webview,
    extensionUri: context.extensionUri,
    bundleName: 'webview',
    title: 'Welcome to Workspai',
    headExtras,
    bootstrapGlobals: {
      ICON_URI: iconUri.toString(),
      FASTAPI_ICON_URI: fastapiIconUri.toString(),
      NESTJS_ICON_URI: nestjsIconUri.toString(),
      GO_ICON_URI: goIconUri.toString(),
      SPRINGBOOT_ICON_URI: springbootIconUri.toString(),
      DOTNET_ICON_URI: dotnetIconUri.toString(),
    },
  });
}
