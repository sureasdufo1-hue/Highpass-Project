"""Standby-only deadline worker. Uses MI permission to deallocate THIS VM only.

No DB action, no key access, no secrets on disk, no token logging. --check is read
only. A guest timer is best-effort; actual Azure deallocation must be confirmed.
"""
import argparse
from datetime import datetime, timezone
import json
import urllib.error
import urllib.request

RID='/subscriptions/a3c0e7d4-ce09-4991-946b-88574869edd9/resourceGroups/rg-highpass-dr-standby-20261016/providers/Microsoft.Compute/virtualMachines/vm-highpass-dr-standby'
END=datetime(2026,10,20,14,59,tzinfo=timezone.utc)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def allowed(now,resource_id):
    if now.tzinfo is None:raise ValueError('EXPLICIT_TIMEZONE_REQUIRED')
    return now.astimezone(timezone.utc)>=END and resource_id.lower()==RID.lower()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    request=urllib.request.Request('http://169.254.169.254/metadata/instance/compute?api-version=2021-02-01',headers={'Metadata':'true'})
    with opener.open(request,timeout=5) as response:compute=json.loads(response.read(65536))
    if compute.get('resourceId','').lower()!=RID.lower():raise ValueError('THIS_APPROVED_STANDBY_VM_ONLY')
    permitted=allowed(datetime.now(timezone.utc),compute['resourceId'])
    if args.check:
        print(json.dumps({'status':'PASS','managedVmIdentityMatches':True,'deadlineUtc':END.isoformat(),
                          'deallocationPermittedNow':permitted,'executed':False}));return 0
    if not permitted:raise ValueError('BEFORE_APPROVED_DEADLINE')
    request=urllib.request.Request('http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F',headers={'Metadata':'true'})
    with opener.open(request,timeout=5) as response:token=json.loads(response.read(65536))['access_token']
    request=urllib.request.Request('https://management.azure.com'+RID+'/deallocate?api-version=2024-07-01',
             method='POST',data=b'',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with opener.open(request,timeout=20) as response:status=response.status
    token=None
    if status not in (200,202):raise ValueError('DEALLOCATION_NOT_ACCEPTED')
    print(json.dumps({'status':'PASS','action':'SELF_DEALLOCATE_REQUEST_ACCEPTED','httpStatus':status,
                      'completedStateStillRequiresAzureReadback':True}));return 0


if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,KeyError,urllib.error.URLError,TimeoutError):
        print(json.dumps({'status':'FAIL','action':'SELF_DEALLOCATE','reason':'DEADLINE_IDENTITY_OR_REQUEST_CHECK_FAILED'}))
        raise SystemExit(1)
