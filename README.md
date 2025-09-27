
### Overview

Git Poison is a VS Code extension that blocks a git commit of any file containing a \"Poison Pill\" string. Placing a pill stops accidental committing of unfinished TODOs, debug statements, secrets, etc. It also provides navigation to pill locations.

![Intro GIF](https://raw.githubusercontent.com/eridien/vscode-git-poison/master/images/intro.gif)

### Fast

All scans use the Git Grep command so this is as fast as normal Git operations.

### Secure

The code to block commits is in a Git pre-commit hook inside of .git. The hook is always active so poison pills are blocked no matter where the git commit is run.  It works in VS Code, external terminals, Git GUI apps, etc. It even works when no VS Code window is running.

### Excluded Files And Folders

Files/folders in *.gitignore*, in addition to the glob patterns in settings, are excluded from the extension actions including *Insert Poison Pill*, scanning the index for pill counts, and watching for pill changes. Jumping to a pill in an excluded file is not excluded. So jumping finds all pills in the workspace.

### All File Types Are Supported

Pills are not limited to code files.  They work in all files containing text, even html, JSON, plain text, etc. It is recommended that you start the pill string with a comment to support placing it in more places. If you want it in JSON I recommend using the JSON Commenter extension written by a great guy.

### Status Bar

The status bar option show S/A where S is the number of pills in staged files.  If S is greater than zero then committing will be blocked.  A is the number of pills in the entire workspace.  Clicking on this status causes a *Scan All Files* command to be executed.

### Uninstall

Unfortunately VS Code does not provide a way for an extension to run cleanup code when it is uninstalled. You should delete the file `.git/hooks/pre-commit` after uninstalling.  However, leaving it in does not really cause a problem because the hook is fast and non-obtrusive.


### Commands

- *Insert Poison Pill*: Paste the poison pill text at the selection.  You can also just type the text instead. Default key is *ctrl-alt-+*.

- *View Next Pill*: Jump to the next pill and show it. It jumps through all pills in the workspace. Default key is *ctrl-alt-)*.

- *View Previous Pill*: Jump to the previous pill and show it. Default key is *ctrl-alt(*.

- *Override Commit Blocking*: This command lets you commit pills without blocking for 30 seconds. This might be useful for temporary commits of a development branch. Default key is *ctrl-alt--*.

- *Incremental Refresh*: Rebuild index of changed files. This should never be needed.  There is no default key.

- *Scan All Files*: Rebuild index of all files in the workspace. This should never be needed. There is no default key.

### Settings

- *Poison Pill String*: The text string of a poison pill. This will be inserted by the *Insert Pill* command and be used to detect pills. *Warning*: If you don't remove old pills before changing this setting, you may accidentally commit them. Default is "//❌".

- *Override Blocking Timeout (Seconds)*: You will be allowed to commit pills for this number of seconds after the *Override Commit Blocking* command is executed. After this time, the blocking will be re-enabled. Default is 30 seconds.

- *Show Status Bar*: Show a status bar item with the number of staged pills and the total number of pills. If the staged count is greater than zero then pill committing is blocked. The total number may be low when scanning is needed.  Default is true.

- *Folders/Files to Exclude*: Glob patterns to exclude from inserting and scanning, in addition to files in *.gitignore*. Use brace expansion syntax like {folder1,folder2} for multiple folders. Comma-separated patterns are not supported, use brace expansion instead.  Default is "&#42;&#42;&#47;{.git,node_modules,dist,build,.cache,out,tmp,temp,coverage}&#47;&#42;&#42;".




#### Author: Mark Hahn (eridien)

#### Marketplace: https://marketplace.visualstudio.com/items?itemName=eridien.git-poison

#### Open VSX: https://open-vsx.org/extension/eridien/git-poison

#### Repo: https://github.com/eridien/vscode-git-poison

#### Original Release: September 2025

#### License: MIT
