; Inno Setup script for Musify (Resona UI) — produces one Musify-Setup-<version>.exe
; Compiled in CI:  ISCC /DAPP_VERSION=<version> installer.iss
; Installs per-user (no admin prompt) into %LOCALAPPDATA%\Programs\Musify.

#ifndef APP_VERSION
  #define APP_VERSION "0.0.0"
#endif

[Setup]
AppName=Musify
AppVersion={#APP_VERSION}
AppPublisher=Musify (Resona UI)
AppPublisherURL=https://github.com/carlsibug98-spec/Resona
DefaultDirName={autopf}\Musify
DefaultGroupName=Musify
UninstallDisplayIcon={app}\musify.exe
OutputDir=installer
OutputBaseFilename=Musify-Setup-{#APP_VERSION}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
SetupIconFile=windows\runner\resources\app_icon.ico

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Musify"; Filename: "{app}\musify.exe"
Name: "{group}\Uninstall Musify"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Musify"; Filename: "{app}\musify.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\musify.exe"; Description: "Launch Musify"; Flags: nowait postinstall skipifsilent
