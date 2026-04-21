import struct
import sys

def check_png(path):
    print(f"Checking {path}...")
    try:
        with open(path, 'rb') as f:
            header = f.read(8)
            if header != b'\x89PNG\r\n\x1a\n':
                print("  Not a valid PNG header.")
                return
            
            while True:
                chunk_header = f.read(8)
                if not chunk_header:
                    break
                length, type = struct.unpack('>I4s', chunk_header)
                if type == b'IHDR':
                    data = f.read(length)
                    width, height, bit_depth, color_type = struct.unpack('>IIBB', data[:10])
                    print(f"  IHDR: {width}x{height}, BitDepth: {bit_depth}, ColorType: {color_type}")
                    # ColorTypes: 0=Grayscale, 2=RGB, 3=Palette, 4=GrayscaleAlpha, 6=RGBA
                    color_desc = {0:"Grayscale", 2:"RGB", 3:"Palette", 4:"GrayscaleAlpha", 6:"RGBA"}
                    print(f"  Color: {color_desc.get(color_type, 'Unknown')}")
                elif type == b'tRNS':
                    print("  Found tRNS chunk (Transparency).")
                    f.seek(length, 1)
                else:
                    f.seek(length, 1)
                f.read(4) # CRC
    except Exception as e:
        print(f"  Error: {e}")

check_png('assets/icon.png')
check_png('assets/adaptive-icon.png')
