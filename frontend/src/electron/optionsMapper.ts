export function mapConvertOptionsToCliArgs(options: Record<string, unknown>): string[] {
  const args: string[] = [];
  if (options.includeFrontMatter === false) args.push("--sem-cabecalho");
  if (options.htmlOriginal === true) args.push("--html-original");
  const platformLabels: Record<string, string> = {
    "google-ai": "Google Modo IA / Search",
    chatgpt: "ChatGPT",
    generic: "Generic",
  };
  const platform = (options.platform as string) || "auto";
  if (platformLabels[platform]) args.push("--plataforma", platformLabels[platform]);
  if (options.title) args.push("--titulo", options.title as string);
  return args;
}
