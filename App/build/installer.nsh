# Personalizzazioni dell'installer NSIS — incluso in automatico da electron-builder.
#
# Senza questa dichiarazione l'installer viene disegnato da Windows a 96 dpi e poi
# ingrandito come un'immagine: su uno schermo 4K al 150% risulta tutto sfocato.
# Dichiarandolo consapevole del DPI, i testi e i controlli vengono ridisegnati
# alla risoluzione vera dello schermo. Vale anche per il disinstallatore, che
# nasce dallo stesso script.
#
# NSIS 3.0.4.1 (quello usato da electron-builder) conosce solo ManifestDPIAware:
# equivale a «system aware», cioè segue il fattore di scala del monitor
# principale. ManifestDPIAwareness (per-monitor) esiste dalla 3.05 in poi.
!macro customHeader
  ManifestDPIAware true
!macroend

# ---------------------------------------------------------------------------
# Disinstallazione: i dati personali non devono sopravvivere di nascosto.
#
# Tab, importi, copie dei documenti e soprattutto i COOKIE di accesso ai
# portali stanno in %APPDATA%\Rendicontazione, che una disinstallazione
# normale non tocca: reinstallando ci si ritroverebbe tutto com'era, e su un
# computer condiviso resterebbero lì.
#
# Si chiede, non si cancella di nascosto: sono anni di rendicontazione.
# In disinstallazione silenziosa (aggiornamento automatico) non si tocca nulla.
# ---------------------------------------------------------------------------
!macro customUnInstall
  ${ifNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Vuoi eliminare anche i dati di Rendicontazione Business?$\r$\n$\r$\nVerranno cancellati: tab e importi, le copie dei documenti in archivio e gli accessi salvati ai portali.$\r$\n$\r$\nSI = riparti da zero alla prossima installazione.$\r$\nNO = i dati restano per una reinstallazione." \
      /SD IDNO IDNO conservaDati
      RMDir /r "$APPDATA\Rendicontazione Business"
      RMDir /r "$LOCALAPPDATA\Rendicontazione Business"
    conservaDati:
  ${endIf}
!macroend
