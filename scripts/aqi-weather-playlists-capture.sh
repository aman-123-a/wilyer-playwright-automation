D=192.168.0.169:5555
for i in $(seq -w 1 32); do
  adb -s $D exec-out screencap -p > reports/aqi-weather-playlists/shots/seq/f$i.png
  date +"f$i %H:%M:%S" >> reports/aqi-weather-playlists/shots/seq/times.txt
  sleep 3
done
