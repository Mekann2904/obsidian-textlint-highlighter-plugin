import { App, SuggestModal, TFile, Notice } from 'obsidian';

export class YamlFileSuggestModal extends SuggestModal<TFile> {
  constructor(app: App, private onSelect: (file: TFile) => void) {
    super(app);
    this.setPlaceholder('prh.ymlファイルを検索...');
  }

  getSuggestions(query: string): TFile[] {
    const yamlFiles = this.app.vault.getFiles().filter(file => 
      file.extension === 'yml' || file.extension === 'yaml'
    );
    
    if (!query) {
      return yamlFiles;
    }

    return yamlFiles.filter(file => 
      file.path.toLowerCase().includes(query.toLowerCase()) ||
      file.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(file: TFile, el: HTMLElement) {
    el.createEl("div", { text: file.name, cls: "suggestion-title" });
    el.createEl("small", { text: file.path, cls: "suggestion-note" });
  }

  onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
    this.onSelect(file);
  }
} 