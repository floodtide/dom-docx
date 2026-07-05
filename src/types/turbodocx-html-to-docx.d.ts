declare module "@turbodocx/html-to-docx" {
  type DocumentOptions = Record<string, unknown>;

  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString: string | null,
    documentOptions?: DocumentOptions,
    footerHTMLString?: string | null,
  ): Promise<ArrayBuffer | Buffer | Blob>;

  export = HTMLtoDOCX;
}
