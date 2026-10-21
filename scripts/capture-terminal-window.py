"""Screenshot-only PrintWindow fallback; no input, activation or pixel redrawing."""
import ctypes,ctypes.wintypes as w,sys,pathlib
import psutil
from PIL import Image
psutil.Process().nice(psutil.NORMAL_PRIORITY_CLASS);psutil.Process().ionice(psutil.IOPRIO_NORMAL)
u=ctypes.WinDLL('user32',use_last_error=True);g=ctypes.WinDLL('gdi32',use_last_error=True)
handle=w.HWND(int(sys.argv[1]));target=pathlib.Path(sys.argv[2]);rect=w.RECT()
u.GetWindowRect.argtypes=[w.HWND,ctypes.POINTER(w.RECT)]
if not u.GetWindowRect(handle,ctypes.byref(rect)):raise RuntimeError('WINDOW_UNAVAILABLE')
width,height=rect.right-rect.left,rect.bottom-rect.top
assert 300<=width<=4000 and 100<=height<=3000
class Header(ctypes.Structure):
 _fields_=[('size',w.DWORD),('width',w.LONG),('height',w.LONG),('planes',w.WORD),('bits',w.WORD),('compression',w.DWORD),('imageSize',w.DWORD),('x',w.LONG),('y',w.LONG),('colors',w.DWORD),('important',w.DWORD)]
class BitmapInfo(ctypes.Structure):_fields_=[('header',Header),('color',w.DWORD*3)]
info=BitmapInfo();info.header=Header(ctypes.sizeof(Header),width,-height,1,32,0,0,0,0,0,0)
g.CreateCompatibleDC.argtypes=[w.HDC];g.CreateCompatibleDC.restype=w.HDC
g.CreateDIBSection.argtypes=[w.HDC,ctypes.POINTER(BitmapInfo),w.UINT,ctypes.POINTER(ctypes.c_void_p),w.HANDLE,w.DWORD];g.CreateDIBSection.restype=w.HBITMAP
g.SelectObject.argtypes=[w.HDC,w.HANDLE];g.SelectObject.restype=w.HANDLE
g.DeleteObject.argtypes=[w.HANDLE];g.DeleteDC.argtypes=[w.HDC]
u.PrintWindow.argtypes=[w.HWND,w.HDC,w.UINT]
dc=g.CreateCompatibleDC(None);bits=ctypes.c_void_p();bitmap=g.CreateDIBSection(dc,ctypes.byref(info),0,ctypes.byref(bits),None,0)
assert dc and bitmap and bits.value
old=g.SelectObject(dc,bitmap)
try:
 if not u.PrintWindow(handle,dc,2):raise RuntimeError('PRINT_WINDOW_FAILED')
 image=Image.frombuffer('RGB',(width,height),ctypes.string_at(bits,width*height*4),'raw','BGRX',0,1)
 image.save(target)
finally:g.SelectObject(dc,old);g.DeleteObject(bitmap);g.DeleteDC(dc)
print(str(target),flush=True)
