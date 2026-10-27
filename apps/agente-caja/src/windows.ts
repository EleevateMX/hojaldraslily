/**
 * Impresión RAW a una impresora de WINDOWS por su nombre (p. ej. "POS-58").
 *
 * El agente nació para térmicas de RED (puerto 9100). Pero una POS-58 USB no
 * escucha en 9100: está colgada del spooler de Windows. Mandarle el ESC/POS
 * por `Out-Printer` no sirve —eso imprime TEXTO y se come los comandos de
 * corte y de estilo—; hay que mandarle los BYTES crudos. La forma correcta en
 * Windows es `WritePrinter` del API de winspool, con el tipo de datos "RAW".
 *
 * No se usa un módulo nativo de Node (node-printer y compañía necesitan
 * compilar con node-gyp, que en una PC de tienda es justo lo que se atora).
 * En su lugar se escribe el buffer a un archivo temporal y se llama a
 * PowerShell con un ayudante en C# (Add-Type) que hace el P/Invoke. El script
 * viaja como `-EncodedCommand` (base64 UTF-16LE) para no pelear con comillas.
 */
import { writeFile, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const AYUDANTE = String.raw`
using System;
using System.IO;
using System.Runtime.InteropServices;
public class LilyRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string src, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  static extern bool WritePrinter(IntPtr h, byte[] buf, int n, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("No se pudo abrir la impresora '" + printer + "' (codigo " + Marshal.GetLastWin32Error() + ")");
    try {
      var di = new DOCINFO();
      di.pDocName = "Ticket Hojaldras Lily";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter fallo");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter fallo");
        int escritos;
        if (!WritePrinter(h, data, data.Length, out escritos)) throw new Exception("WritePrinter fallo");
        if (escritos != data.Length) throw new Exception("Se escribieron " + escritos + " de " + data.Length + " bytes");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
`

/** Manda los bytes crudos a la impresora de Windows `nombre`. Lanza si falla. */
export function imprimirWindows(bytes: Buffer, nombre: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const archivo = join(tmpdir(), `lily-ticket-${randomUUID()}.bin`)
    const limpiar = () => { void unlink(archivo).catch(() => {}) }
    writeFile(archivo, bytes).then(() => {
      const ps = [
        '$ErrorActionPreference = "Stop"',
        `Add-Type -TypeDefinition @'`,
        AYUDANTE,
        `'@`,
        `[LilyRaw]::Send('${nombre.replace(/'/g, "''")}', [IO.File]::ReadAllBytes('${archivo.replace(/'/g, "''")}'))`,
      ].join('\n')
      const b64 = Buffer.from(ps, 'utf16le').toString('base64')
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
        { timeout: 20_000, windowsHide: true },
        (err, _stdout, stderr) => {
          limpiar()
          if (err) reject(new Error(`impresora de Windows "${nombre}": ${(stderr || err.message).trim()}`))
          else resolve()
        },
      )
    }).catch((e) => { limpiar(); reject(e) })
  })
}
