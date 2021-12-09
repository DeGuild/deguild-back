# deguild-back
Firebase Functions + Alchemy web3 + Web3-token

APIs in this repository can be accessed with Authorization tokens and some APIs are restricted to the magic shop owner only

## List of APIs

### Currently using APIS
#### POST
```
Path: /addJob
Request's body example:
{
    title: job.title,
    address: deGuildAddress,
    level: job.level,
    tokenId: tokenId.toString(),
    description: job.desc,
    name: 'Parm',
    time: job.duration,
}
```
```
Path: /deleteJob
Request's body example:
{
    address: "0xFA0Db8E0f8138A1675507113392839576eD3052c",
    jobId: "0",
}
```
```
Path: /register
Request's body example:
{
    name: state.username,
    url: state.url,
    address: deGuildAddress,
}
```
```
Path: /submission/:address
```
#### PUT
```
Path: /profile
Request's body example:
{
    name: state.username,
    url: state.url,
    address: deGuildAddress,
}
```
```
Path: /submit
Request's body example:
{
    addressM: shopAddress,
    addressC: downloading.course.address,
    tokenId: downloading.course.tokenId,
    coursePassword: state.newRound,
}
```
#### GET
```
/submission/:address/:jobId
```
## Deployment
Use this to develop your code locally

    firebase emulators:start 

Use this to deploy

    firebase deploy