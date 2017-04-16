$(document).ready(function(){
	console.log("document ready!");
	
	$("#report-button").button().click(function(){
		console.log("report button pressed");
		
		// get fights JSON
		var reportCode = $("#report-input").value;
		var apiKey = "087783eb78c21061d028831d2344d118";
		var url = "https://www.warcraftlogs.com/v1/report/fights/" + reportCode
	  		+ "?api_key=" + apiKey;
		console.log("fetching json from " + url);
		var reportObj = $.getJSON(url);
		
		console.log(JSON.stringify(reportObj));
		
		// test if we've got fights JSON
		var fights = reportObj.fights;		
		$("#fight-div").append(fights[0].name);
	});    

});
