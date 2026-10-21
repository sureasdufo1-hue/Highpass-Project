"""Root-only guest read-only DR inventory. Never prints secrets or patient rows."""
import json
import os
import pathlib
import shutil
import subprocess

NAME = 'hp-capstone-control-postgres-1'


def run(args):
    return subprocess.check_output(args, timeout=15).decode().strip()


def main():
    sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='5s';
    SELECT json_build_object(
      'settings',(SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN
        ('data_directory','hba_file','ssl_cert_file','ssl_key_file','ssl_ca_file',
         'max_connections','wal_level','max_wal_senders','max_replication_slots','wal_keep_size',
         'max_slot_wal_keep_size','synchronous_standby_names','log_statement','log_min_error_statement',
         'full_page_writes','checkpoint_timeout')),
      'dbBytes',(SELECT sum(pg_database_size(oid)) FROM pg_database),
      'connections',(SELECT count(*) FROM pg_stat_activity),
      'started',pg_postmaster_start_time(),'recovery',pg_is_in_recovery(),
      'tablespaces',(SELECT count(*) FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global')),
      'existingDrRole',(SELECT count(*) FROM pg_roles WHERE rolname='hp_dr_repl_20261016'),
      'hba',(SELECT coalesce(json_agg(t),'[]') FROM
        (SELECT type,database,user_name,address,auth_method,error FROM pg_hba_file_rules LIMIT 50) t));
    ROLLBACK;"""
    out = json.loads(run(['docker', 'exec', NAME, 'psql', '-X', '-qAt', '-U', 'hipass_bootstrap', '-d', 'hipass', '-c', sql]))
    item = json.loads(run(['docker', 'inspect', NAME]))[0]
    out['image'] = item['Config']['Image']
    out['imageId'] = item['Image']
    out['mounts'] = [{k.lower(): m[k] for k in ('Source','Destination','Type')} for m in item['Mounts']]
    out['networks'] = {k: {'address': v['IPAddress'], 'gateway': v['Gateway']}
                       for k, v in item['NetworkSettings']['Networks'].items()}
    out['diskFreeBytes'] = shutil.disk_usage('/').free
    out['load'] = os.getloadavg()
    out['imageRepoDigests'] = json.loads(run(['docker', 'image', 'inspect', item['Image']]))[0]['RepoDigests']
    memory = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    out['memAvailableKiB'] = int(memory['MemAvailable'].split()[0])
    certfile = out['settings']['ssl_cert_file']
    certpath = certfile if certfile.startswith('/') else out['settings']['data_directory'] + '/' + certfile
    public_cert = subprocess.check_output(['docker', 'exec', NAME, 'cat', certpath], timeout=10)
    cert = subprocess.run(['openssl', 'x509', '-noout', '-subject', '-issuer', '-dates', '-ext', 'subjectAltName', '-fingerprint', '-sha256'],
                          input=public_cert, capture_output=True, timeout=10, check=True)
    out['publicCertificateMetadata'] = cert.stdout.decode()
    out['privateCertificateOutsidePgdata'] = not out['settings']['ssl_key_file'].startswith(out['settings']['data_directory'] + '/') and out['settings']['ssl_key_file'].startswith('/')
    print(json.dumps(out))


if __name__ == '__main__':
    main()
