// extending Thomas Down's original BAM js work 

var Bam = Class.extend({
   
   init: function(bamUri, options) {
      this.bamUri = bamUri;
      this.options = options; // *** add options mapper ***
      // test if file or url
      if (typeof(this.bamUri) == "object") {
         this.sourceType = "file";
         this.bamBlob = new BlobFetchable(bamUri); 
         this.baiBlob = new BlobFetchable(this.options.bai); // *** add if statement if here ***
         this.promises = [];
         this.bam = undefined;
         var me = this;
         makeBam(this.bamBlob, this.baiBlob, function(bam) {
            me.setHeader(bam.header);
            me.provide(bam); 
         });
      } else if ( this.bamUri.slice(0,4) == "http" ) {
         this.sourceType = "url";         
      }
      
      // set iobio servers
      this.iobio = {}
      this.iobio.bamtools = "ws://bamtools.iobio.io";
      // this.iobio.samtools = "ws://samtools.iobio.io";
      this.iobio.samtools = "ws://0.0.0.0:8060";
      this.iobio.bamMerger = "ws://bammerger.iobio.io";
      // this.iobio.bamstatsAlive = "ws://bamstatsalive.iobio.io"
      this.iobio.bamstatsAlive = "ws://0.0.0.0:7100";
      
      return this;
   },
   
   fetch: function( name, start, end, callback, options ) {
      var me = this;      
      // handle bam has been created yet
      if(this.bam == undefined) // **** TEST FOR BAD BAM ***
         this.promise(function() { me.fetch( name, start, end, callback, options ); });
      else
         this.bam.fetch( name, start, end, callback, options );
   },
   
   promise: function( callback ) {
      this.promises.push( callback );
   },
   
   provide: function(bam) {
      this.bam = bam;
      while( this.promises.length != 0 ) 
         this.promises.shift()();
   },
   
   _makeid: function() {
      // make unique string id;
       var text = "";
       var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

       for( var i=0; i < 5; i++ )
           text += possible.charAt(Math.floor(Math.random() * possible.length));

       return text;
   },
   
   _getBamUrl: function(name, start, end) {
      return this._getBamRegionsUrl([ {'name':name,'start':start,'end':end} ]);
   },
   
   _getBamRegionsUrl: function(regions) {
      if ( this.sourceType == "url") {
         var regionStr = "";
         regions.forEach(function(region) { regionStr += " " + region.name + ":" + region.start + "-" + region.end });
         var url = this.iobio.samtools + "?cmd= view -b " + this.bamUri + regionStr + "&encoding=binary";
      } else {
         // creates a url for a new bam that is sliced from an old bam
         // open connection to iobio webservice that will request this data, since connections can only be opened from browser
         var me = this;
         var connectionID = this._makeid();
         var client = BinaryClient(this.iobio.samtools + '?id=', {'connectionID' : connectionID} );
         client.on('open', function(stream){
            var stream = client.createStream({event:'setID', 'connectionID':connectionID});
            stream.end();
         })
      
         var url = this.iobio.samtools + "?protocol=websocket&encoding=binary&cmd=view -S -b " + encodeURIComponent("http://client?&id="+connectionID);
         var ended = 0;
         var me = this;
         // send data to samtools when it asks for it
         client.on('stream', function(stream, options) {
            stream.write(me.header.toStr);
            regions.forEach(function(region){
               me.convert('sam', region.name, region.start, region.end, function(data,e) {   
                  stream.write(data);
                  ended += 1;
                  if ( regions.length == ended) stream.end();
               }, {noHeader:true});               
            })
         })
      }
      return encodeURI(url);
   },
   
   getReferencesWithReads: function(callback) {
      var refs = [];
      var me = this;
      if (this.sourceType == 'url') {
         
      } else {
         this.getHeader(function(header) {
            for (var i=0; i < header.sq.length; i++) {
               if ( me.bam.indices[me.bam.chrToIndex[header.sq[i].name]] != undefined )
                  refs.push( header.sq[i] );
            }
            callback(refs);
         })
      }
   },
   
   // *** bamtools functionality ***

   convert: function(format, name, start, end, callback, options) {
      // Converts between BAM and a number of other formats
      if (!format || !name || !start || !end)
         return "Error: must supply format, sequenceid, start nucleotide and end nucleotide"
      
      if (format.toLowerCase() != "sam")
         return "Error: format + " + options.format + " is not supported"
      var me = this;   
      this.fetch(name, start, end, function(data,e) {
         if(options && options.noHeader)
            callback(data, e);
         else {
            me.getHeader(function(h) {
               callback(h.toStr + data, e);
            })
         }
      }, { 'format': format })
   },
   
   count: function() {
      // Prints number of alignments in BAM file(s)
   },
   
   coverage: function() {
      // Prints coverage statistics from the input BAM file
   },
   
   filter: function() {
      // Filters BAM file(s) by user-specified criteria
   },
   
   getHeader: function(callback) {
      var me = this;
      if (me.header)
         callback(me.header);
      else if (me.sourceType == 'file')
         me.promise(function() { me.getHeader(callback); })
      else {
         var client = BinaryClient(this.iobio.samtools);
         var url = encodeURI( this.iobio.samtools + '?cmd=view -H ' + this.bamUri)
         client.on('open', function(stream){
            var stream = client.createStream({event:'run', params : {'url':url}});
            var headerStr = ""
            stream.on('data', function(data, options) {
               headerStr += data;
            });
            stream.on('end', function() { 
               me.setHeader(headerStr)               
               callback(me.header);
            });
         });
      }
         
      // need to make this work for URL bams
      // need to incorporate real promise framework throughout
   },
   
   setHeader: function(headerStr) {
      var header = { sq:[], toStr : headerStr };
      var lines = headerStr.split("\n");
      for ( var i=0; i<lines.length; i++) {
         var fields = lines[i].split("\t");
         if (fields[0] == "@SQ") {
            var name = fields[1].split("SN:")[1];
            var length = parseInt(fields[2].split("LN:")[1]);
            header.sq.push({name:name, end:1+length});
         }
      }               
      this.header = header;
   },
   	
   index: function() {
      // Generates index for BAM file
   },
   
   merge: function() {
      // Merge multiple BAM files into single file
   },
   
   random: function() {
      // Select random alignments from existing BAM file(s), intended more as a testing tool.
   },
   
   resolve: function() {
      // Resolves paired-end reads (marking the IsProperPair flag as needed)
   },
   
   revert: function() {
      // Removes duplicate marks and restores original base qualities
   },
   
   sort: function() {
      // Sorts the BAM file according to some criteria
   },
   
   split: function() {
      // Splits a BAM file on user-specified property, creating a new BAM output file for each value found
   },
   
   stats: function(name, start, end, callback) {
      // Prints some basic statistics from input BAM file(s)
      var client = BinaryClient(this.iobio.bamstatsAlive);
      var url = encodeURI( this.iobio.bamstatsAlive + '?cmd=-u 1000 -s ' + start + " -l " + parseInt(end-start) + " " + encodeURIComponent(this._getBamUrl(name,start,end)) );
      client.on('open', function(stream){
         var stream = client.createStream({event:'run', params : {'url':url}});
         var buffer = "";
         stream.on('data', function(data, options) {
            if (data == undefined) return;
            var success = true;
            try {
              var obj = JSON.parse(buffer + data)
            } catch(e) {
              success = false;
              buffer += data;
            }
            if(success) {
              buffer = "";
              callback(obj); 
            }
         });
      });
   }, 
   
   sampleStats: function(callback, options) {
      // Prints some basic statistics from sampled input BAM file(s)      
      options = $.extend({
         binSize : 10000, // defaults
         binNumber : 50,
         start : 1,
      },options);
      var me = this;
      
      function goSampling(SQs) {      
         var regions = [];
         for (var j=0; j < SQs.length; j++) {
            var sqStart = SQs[j].start || options.start || 1;
            var length = SQs[j].end - sqStart;
            if ( length < options.binSize * options.binNumber) {
               regions.push(SQs[j])
            } else {
               for (var i=0; i < options.binNumber; i++) {   
                  
                  var regionStart = parseInt(sqStart + length/options.binNumber * i);
                  regions.push({
                     'name' : SQs[j].name,
                     'start' : regionStart,
                     'end' : regionStart + options.binSize
                  });
               }
            }
         }      
         
         var client = BinaryClient(me.iobio.bamstatsAlive);
         var url = encodeURI( me.iobio.bamstatsAlive + '?cmd=-u 1000 -s ' + options.start + " -l " + length + " " + encodeURIComponent(me._getBamRegionsUrl(regions)));
                  // var url = encodeURI( me.iobio.bamstatsAlive + '?cmd=-u 1000 ' + encodeURIComponent(me._getBamRegionsUrl(regions)));
         var buffer = "";
         client.on('open', function(stream){
            var stream = client.createStream({event:'run', params : {'url':url}});
            stream.on('data', function(data, options) {
               if (data == undefined) return;
               var success = true;
               try {
                 var obj = JSON.parse(buffer + data)
               } catch(e) {
                 success = false;
                 buffer += data;
               }
               if(success) {
                 buffer = "";
                 callback(obj); 
               }               
            });
         });
      }
      
      if ( options.sequenceNames != undefined && options.sequenceNames.length == 1 && options.start != undefined && options.end != undefined) {
         goSampling([{name:options.sequenceNames[0], start:options.start, end:options.end}]);
      } else  {
         this.getHeader(function(header){
            goSampling(header.sq);
         })
         // this.getReferencesWithReads(function(refs) {            
         //    goSampling(refs);
         // })
      }
   }   
   
});