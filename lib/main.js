'use babel';  /* jshint esversion: 8, asi: true */
const fs = require('fs-plus')
const { CompositeDisposable } = require('atom')

let IansasciidocPreviewFrommarkdownpreviewView = null
let renderer = null

const isIansasciidocPreviewFrommarkdownpreviewView = function (object) {
  if (IansasciidocPreviewFrommarkdownpreviewView == null) {
    IansasciidocPreviewFrommarkdownpreviewView = require('./iansasciidoc-preview-frommarkdownpreview-view')
  }
  return object instanceof IansasciidocPreviewFrommarkdownpreviewView
}

module.exports = {
  activate () {
    this.disposables = new CompositeDisposable()
    this.commandSubscriptions = new CompositeDisposable()

    this.disposables.add(
      atom.config.observe('iansasciidoc-preview-frommarkdownpreview.grammars', grammars => {
        this.commandSubscriptions.dispose()
        this.commandSubscriptions = new CompositeDisposable()

        if (grammars == null) {
          grammars = []
        }

        for (const grammar of grammars.map(grammar =>
          grammar.replace(/\./g, ' ')
        )) {
          this.commandSubscriptions.add(
            atom.commands.add(`atom-text-editor[data-grammar='${grammar}']`, {
              'iansasciidoc-preview-frommarkdownpreview:toggle': () => this.toggle(),
              'iansasciidoc-preview-frommarkdownpreview:copy-html': {
                displayName: 'Markdown Preview: Copy HTML',
                didDispatch: () => this.copyHTML()
              },
              'iansasciidoc-preview-frommarkdownpreview:save-as-html': {
                displayName: 'Markdown Preview: Save as HTML',
                didDispatch: () => this.saveAsHTML()
              },
              'iansasciidoc-preview-frommarkdownpreview:toggle-break-on-single-newline': () => {
                const keyPath = 'iansasciidoc-preview-frommarkdownpreview.breakOnSingleNewline'
                atom.config.set(keyPath, !atom.config.get(keyPath))
              },
              'iansasciidoc-preview-frommarkdownpreview:toggle-github-style': () => {
                const keyPath = 'iansasciidoc-preview-frommarkdownpreview.useGitHubStyle'
                atom.config.set(keyPath, !atom.config.get(keyPath))
              }
            })
          )
        }
      })
    )

    const previewFile = this.previewFile.bind(this)
    for (const extension of [
      //'adoc', 
      'markdown',
      'md',
      'mdown',
      'mkd',
      'mkdown',
      'ron',
      'txt'  // added ianschange
            // added ianschange
    ]) {
      this.disposables.add(
        atom.commands.add(
          `.tree-view .file .name[data-name$=\\.${extension}]`,
          'iansasciidoc-preview-frommarkdownpreview:preview-file',
          previewFile
        )
      )
    }

    this.disposables.add(
      atom.workspace.addOpener(uriToOpen => {
        let [protocol, path] = uriToOpen.split('://')
        if (protocol !== 'iansasciidoc-preview-frommarkdownpreview') {
          return
        }

        try {
          path = decodeURI(path)
        } catch (error) {
          return
        }

        if (path.startsWith('editor/')) {
          return this.createIansasciidocPreviewFrommarkdownpreviewView({ editorId: path.substring(7) })
        } else {
          return this.createIansasciidocPreviewFrommarkdownpreviewView({ filePath: path })
        }
      })
    )
  },

  deactivate () {
    this.disposables.dispose()
    this.commandSubscriptions.dispose()
  },

  createIansasciidocPreviewFrommarkdownpreviewView (state) {
    if (state.editorId || fs.isFileSync(state.filePath)) {
      if (IansasciidocPreviewFrommarkdownpreviewView == null) {
        IansasciidocPreviewFrommarkdownpreviewView = require('./iansasciidoc-preview-frommarkdownpreview-view')
      }
      return new IansasciidocPreviewFrommarkdownpreviewView(state)
    }
  },

  toggle () {
    if (isIansasciidocPreviewFrommarkdownpreviewView(atom.workspace.getActivePaneItem())) {
      atom.workspace.destroyActivePaneItem()
      return
    }

    const editor = atom.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    const grammars = atom.config.get('iansasciidoc-preview-frommarkdownpreview.grammars') || []
    if (!grammars.includes(editor.getGrammar().scopeName)) {
      return
    }

    if (!this.removePreviewForEditor(editor)) {
      return this.addPreviewForEditor(editor)
    }
  },

  uriForEditor (editor) {
    return `iansasciidoc-preview-frommarkdownpreview://editor/${editor.id}`
  },

  removePreviewForEditor (editor) {
    const uri = this.uriForEditor(editor)
    const previewPane = atom.workspace.paneForURI(uri)
    if (previewPane != null) {
      previewPane.destroyItem(previewPane.itemForURI(uri))
      return true
    } else {
      return false
    }
  },

  addPreviewForEditor (editor) {
    const uri = this.uriForEditor(editor)
    const previousActivePane = atom.workspace.getActivePane()
    const options = { searchAllPanes: true }
    if (atom.config.get('iansasciidoc-preview-frommarkdownpreview.openPreviewInSplitPane')) {
      options.split = 'right'
    }

    return atom.workspace
      .open(uri, options)
      .then(function (iansasciidocPreviewFrommarkdownpreviewView) {
        if (isIansasciidocPreviewFrommarkdownpreviewView(iansasciidocPreviewFrommarkdownpreviewView)) {
          previousActivePane.activate()
        }
      })
  },

  previewFile ({ target }) {
    const filePath = target.dataset.path
    if (!filePath) {
      return
    }

    for (const editor of atom.workspace.getTextEditors()) {
      if (editor.getPath() === filePath) {
        return this.addPreviewForEditor(editor)
      }
    }

    atom.workspace.open(`iansasciidoc-preview-frommarkdownpreview://${encodeURI(filePath)}`, {
      searchAllPanes: true
    })
  },

  async copyHTML () {
    const editor = atom.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    if (renderer == null) {
      renderer = require('./renderer')
    }
    const text = editor.getSelectedText() || editor.getText()
    const html = await renderer.toHTML(
      text,
      editor.getPath(),
      editor.getGrammar()
    )

    atom.clipboard.write(html)
  },

  saveAsHTML () {
    const activePaneItem = atom.workspace.getActivePaneItem()
    if (isIansasciidocPreviewFrommarkdownpreviewView(activePaneItem)) {
      atom.workspace.getActivePane().saveItemAs(activePaneItem)
      return
    }

    const editor = atom.workspace.getActiveTextEditor()
    if (editor == null) {
      return
    }

    const grammars = atom.config.get('iansasciidoc-preview-frommarkdownpreview.grammars') || []
    if (!grammars.includes(editor.getGrammar().scopeName)) {
      return
    }

    const uri = this.uriForEditor(editor)
    const iansasciidocPreviewFrommarkdownpreviewPane = atom.workspace.paneForURI(uri)
    const iansasciidocPreviewFrommarkdownpreviewPaneItem =
      iansasciidocPreviewFrommarkdownpreviewPane != null
        ? iansasciidocPreviewFrommarkdownpreviewPane.itemForURI(uri)
        : undefined

    if (isIansasciidocPreviewFrommarkdownpreviewView(iansasciidocPreviewFrommarkdownpreviewPaneItem)) {
      return iansasciidocPreviewFrommarkdownpreviewPane.saveItemAs(iansasciidocPreviewFrommarkdownpreviewPaneItem)
    }
  }
}
