; Windows installer for the PC app (Inno Setup 6). Built by .github/workflows/pc-app.yml:
;   iscc /DAppVersion=0.2.0 worker\packaging\windows.iss
; Installs for the current user only (no admin prompt).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Cute Wedding Polaroid"

[Setup]
AppId={{7C1B7F2E-6A0B-4E5C-9F6A-3C2D1E0B9A41}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppName}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=CuteWeddingPolaroid-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppName}.exe

[Tasks]
Name: "desktopicon"; Description: "Add a desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startup"; Description: "Open the app when I sign in to Windows"; GroupDescription: "Start-up:"; Flags: unchecked

[Files]
Source: "..\dist\{#AppName}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{app}\{#AppName}.exe"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; Tasks: startup

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "Open {#AppName} now"; Flags: nowait postinstall skipifsilent
