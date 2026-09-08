export {};

declare global {
  interface Window {
    electronAPI: {
      convert: (data: { html: string; fileName: string; options: Record<string, unknown> }) => Promise<{
        markdown: string;
        fileName: string;
        outputName: string;
      }>;
    };
  }
}
