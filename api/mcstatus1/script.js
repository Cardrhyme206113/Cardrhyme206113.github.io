//based on a pen by @robinselmer
var url = "https://api.minetools.eu/ping/cardrhyme.myminecraft.org/";
 
$.getJSON(url, function(r) {
    //data is the JSON string
 if(r.error){
    $('#rest').html('Server Offline');
   return false;
 } 
var pl = '';
 if(r.players.sample.length > 0 ){ pl = '<br>OP: '+r.players.sample[0].name;  } 
  $('#rest').html(r.description.replace(/§(.+?)/gi, '')+'<br><b>Players Online:</b> '+r.players.online+pl);
 $('#favicon').attr('src', r.favicon);
    
});