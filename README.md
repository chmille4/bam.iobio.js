## Usage
    // create bam object with either an http url to a bam or a html5 FILE object
    var bam = new Bam( bamUrl );
    var bam = new Bam( bamFile , { bai: baiFile });
    
    // Fetch region
    // bam.fetch( name, start, end, callback );
    // where name is chromosome or sequence name
    // start and end are region coordinates, 
    // callback is what handles the returned data
    bam.fetch("chr1", 2000000, 250000, function(records) {
  	// do something with records
    })
     
    // fetch as sam format
    bam.convert("sam", "chr1", 2000000, 250000, function(records) {
  	// do something with records
    })
 
