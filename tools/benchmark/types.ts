export interface BenchmarkLibrary {
  id: string;
  npm: string;
  version: string;
  description: string;
  convertHtmlFragment(htmlFragment: string): Promise<Buffer>;
}
