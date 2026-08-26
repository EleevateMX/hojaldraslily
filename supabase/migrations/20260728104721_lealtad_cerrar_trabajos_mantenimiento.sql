-- Los trabajos de lealtad los corre cron (como postgres); ninguna app los
-- llama. Se quitan del alcance de la anon key para que nadie fuerce el
-- reparto de cupones/mancuernas por /rest/v1/rpc.
revoke execute on function fn_generar_cupones_cumpleanos() from public, anon, authenticated;
revoke execute on function fn_expirar_cupones()            from public, anon, authenticated;
revoke execute on function fn_reactivacion()               from public, anon, authenticated;
revoke execute on function fn_acumular_mancuernas()        from public, anon, authenticated;