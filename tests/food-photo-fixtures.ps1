Add-Type -AssemblyName System.Drawing
$taskOutput = Join-Path $env:TEMP 'pfd-food-photo-tests'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$image = [System.Drawing.Bitmap]::new(1000,650)
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.Clear([System.Drawing.Color]::White)
$font = [System.Drawing.Font]::new('Arial',28)
$lines = @('TEST LABEL - na 100 g', 'Energie 340 kJ / 81 kcal', 'Tuky 1,6 g', 'Sacharidy 6,4 g', 'Bilkoviny 10 g', 'Sul 0,28 g')
for($i=0;$i -lt $lines.Count;$i++) { $graphics.DrawString($lines[$i],$font,[System.Drawing.Brushes]::Black,35,35+$i*85) }
$image.Save((Join-Path $taskOutput 'label.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $image.Dispose(); $font.Dispose()
$left = @('0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011')
$even = @('0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111')
$right = @('1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100')
$parities = @('LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL')
$code = '8594001170012'
$bits = '101'
$parity = $parities[[int]::Parse($code.Substring(0,1))]
for($i=1;$i -le 6;$i++) { $digit=[int]::Parse($code.Substring($i,1)); if($parity[$i-1] -eq 'L') { $bits += $left[$digit] } else { $bits += $even[$digit] } }
$bits += '01010'
for($i=7;$i -le 12;$i++) { $bits += $right[[int]::Parse($code.Substring($i,1))] }
$bits += '101'
$image = [System.Drawing.Bitmap]::new(650,350)
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.Clear([System.Drawing.Color]::White)
for($i=0;$i -lt $bits.Length;$i++) { if($bits[$i] -eq '1') { $graphics.FillRectangle([System.Drawing.Brushes]::Black,75+$i*5,40,5,240) } }
$image.Save((Join-Path $taskOutput 'barcode.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $image.Dispose()
Write-Output $taskOutput
