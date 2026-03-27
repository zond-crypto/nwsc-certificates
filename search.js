const fetch = require('node-fetch');
async function search() {
  const res = await fetch('https://api.duckduckgo.com/?q=Nkana+Water+and+Sewerage+Company+logo+png&format=json');
  const json = await res.json();
  console.log(json);
}
search();
