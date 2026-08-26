#!/bin/sh
# Adapta una migracion SQL del proyecto original (Shakeaholic) al proyecto
# Hojaldras Lily: ref de Supabase, dominios, redes y literales de marca.
# Uso: adaptar-sql-lily.sh archivo.sql   (edita en su lugar)
# El orden importa: de lo mas especifico a lo mas general.
sed -i \
  -e 's/zyjtnaystsporbuzcmqk/fzkdgqqvfkogmxdgqsxj/g' \
  -e 's/api\.shakeaholic\.mx/fzkdgqqvfkogmxdgqsxj.supabase.co/g' \
  -e 's/rewards\.shakeaholic\.mx/rewards.hojaldraslily.com/g' \
  -e 's/shakeaholic\.mx/hojaldraslily.com/g' \
  -e 's/@shakeaholicmx/@hojaldraslily/g' \
  -e 's/shakeaholicmx/hojaldraslily/g' \
  -e 's/Shakeaholic M\xc3\xa9rida/Hojaldras Lily M\xc3\xa9rida/g' \
  -e 's/SHAKEAHOLIC/HOJALDRAS LILY/g' \
  -e 's/Shakeaholic/Hojaldras Lily/g' \
  -e 's/shakeaholic/hojaldraslily/g' \
  "$1"
