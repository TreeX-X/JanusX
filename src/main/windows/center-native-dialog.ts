import { spawn } from 'node:child_process'
import type { BrowserWindow } from 'electron'

// Electron exposes no position option for Windows common dialogs. Match only
// the visible native dialog owned by this window, then move it once without
// changing its size, activation or z-order. Stop watching on close/cancel.
export function watchNativeDialogPosition(parent: BrowserWindow): () => void {
  if (process.platform !== 'win32' || parent.isDestroyed()) return () => {}
  const handle = parent.getNativeWindowHandle()
  const owner = handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())
  const helper = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand',
    Buffer.from(nativeDialogCenterScript(owner), 'utf16le').toString('base64'),
  ], { windowsHide: true, stdio: 'ignore' })
  const stop = () => { if (helper.exitCode === null) helper.kill() }
  const timeout = setTimeout(stop, 15_000)
  timeout.unref()
  helper.once('error', () => clearTimeout(timeout))
  helper.once('exit', () => clearTimeout(timeout))
  return () => { clearTimeout(timeout); stop() }
}

export function nativeDialogCenterScript(owner: bigint): string {
  return `
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class JanusDialogPosition {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  public delegate bool EnumProc(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  public static void Center(long ownerValue) {
    IntPtr owner = new IntPtr(ownerValue);
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var clock = Stopwatch.StartNew();
    while (clock.ElapsedMilliseconds < 10000 && IsWindow(owner)) {
      IntPtr found = IntPtr.Zero;
      EnumWindows((window, data) => {
        if (GetWindow(window, 4) != owner || !IsWindowVisible(window)) return true;
        var name = new StringBuilder(64);
        GetClassName(window, name, name.Capacity);
        if (name.ToString() != "#32770") return true;
        found = window;
        return false;
      }, IntPtr.Zero);
      Rect parent, child;
      if (found != IntPtr.Zero && GetWindowRect(owner, out parent) && GetWindowRect(found, out child)) {
        int width = child.Right - child.Left, height = child.Bottom - child.Top;
        int x = parent.Left + (parent.Right - parent.Left - width) / 2;
        int y = parent.Top + (parent.Bottom - parent.Top - height) / 2;
        var monitor = new MonitorInfo();
        monitor.Size = Marshal.SizeOf(typeof(MonitorInfo));
        if (GetMonitorInfo(MonitorFromWindow(owner, 2), ref monitor)) {
          x = Math.Max(monitor.Work.Left, Math.Min(x, monitor.Work.Right - width));
          y = Math.Max(monitor.Work.Top, Math.Min(y, monitor.Work.Bottom - height));
        }
        SetWindowPos(found, IntPtr.Zero, x, y, 0, 0, 0x15);
        return;
      }
      Thread.Sleep(40);
    }
  }
}
'@
[JanusDialogPosition]::Center(${owner})
`
}
