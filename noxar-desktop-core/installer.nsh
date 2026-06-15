!macro preInit
  # Force terminate any running instances of noxar.exe before installing/upgrading
  ExecWait 'taskkill /F /IM "noxar.exe" /T'
!macroend
