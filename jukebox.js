/**
 * Main module
 */
/*global Songs:true, AppStates:true*/

// Set up a collection to contain song information. On the server,
// it is backed by a MongoDB collection named 'songs'.
Songs = new Meteor.Collection('songs');
AppStates = new Meteor.Collection('appstates');

if (Meteor.isClient) {
	Session.setDefault('urlFetching', false);
	Session.setDefault('showAll', false);
	Session.setDefault('tab', 'tab--play-list');

	var player; //the MediaElement instance

	Template.songlist.helpers({
		songs: function() {
			var tab = Session.get('tab');
			var earlyOfToday = new Date();
			var songList;
			earlyOfToday.setHours(0, 0, 0, 0);

			switch (tab) {
				case 'tab--play-list':
					var today = new Date();
					today.setHours(0, 0, 0, 0); //reset to start of day
					songList = Songs.find({timeAdded: {$gt: today.getTime()}}, {sort: {timeAdded: 1}});
					break;

				case 'tab--yesterday':
					var last7Days = moment().add(-1, 'days').toDate();
					last7Days.setHours(0, 0, 0, 0);
					songList = Songs.find(
						{timeAdded: {$gt: last7Days.getTime(), $lt: earlyOfToday.getTime()}},
						{sort: {timeAdded: 1}}
					);
					break;

				case 'tab--past-7-days':
					var last7Days = moment().add(-7, 'days').toDate();
					last7Days.setHours(0, 0, 0, 0);
					songList = Songs.find(
						{timeAdded: {$gt: last7Days.getTime(), $lt: earlyOfToday.getTime()}},
						{sort: {timeAdded: 1}}
					);
					break;

				case 'tab--naustorm':
					songList = [];
					break;

				default:
					songList = [];
					break;
				}

			return songList;
		},

		loadingHidden: function() {
			return Session.get('urlFetching') ? '' : 'hidden';
		}
	});

	Template.song.helpers({
		selected: function() {
			return Session.equals('selectedSong', this._id) ? '_selected' : '';
		},

		playing: function() {
			var playingSongs = AppStates.findOne({key: 'playingSongs'});
			if (playingSongs && Array.isArray(playingSongs.songs)) {
				return (playingSongs.songs.indexOf(this._id) !== -1) ? '_playing' : '';
			} else {
				return '';
			}
		},

		addDate: function() {
			var m = moment(this.timeAdded);
			return m.fromNow();
		},

		originBadgeColor: function() {
			var color = 'black';
			switch (this.origin) {
				case 'NCT':
					color = 'nct';
					break;
				case 'Zing':
					color = 'zing';
					break;
			}
			return color;
		}
	});

	Template.songlist.events({
		'click #songurl': function(event) {
			event.currentTarget.select();
		},
	});

	Template.song.events({
		'click .js-song-item': function() {
			playSong(this);
		},
		'click .remove-btn': function(e) {
			Songs.remove(this._id);
			if (Session.equals('selectedSong', this._id)) {
				//selected song playing
				_pause();
				player.media.src = '';
				AppStates.updatePlayingSongs('', this._id);
			}
			e.stopPropagation();
		},
		'click .rebook-btn': function(e) {
			// add current url into input field
			$('[name="songurl"]').val(this.originalURL);
			// turn on flag of fetching data
			Session.set('urlFetching', true);
			//call server
			Meteor.call('getSongInfo', this.originalURL, function(error, result) {
				if (error) {
					alert('Cannot add the song at:\n' + this.originalURL + '\nReason: ' + error.reason);
				}
				$('[name="songurl"]').val('');
				// turn off flag of fetching data
				Session.set('urlFetching', false);
			});
			e.stopPropagation();
		}
	});

	Template.player.events({
		'playing #audio-player': function() {
			AppStates.updatePlayingSongs(Session.get('selectedSong'));
		},

		'pause #audio-player': function() {
			// remove from playing songs list
			AppStates.updatePlayingSongs('', Session.get('selectedSong'));
		},
		// event dispatched from the audio element
		'ended #audio-player': function() {
			console.log('Audio ended for:', player.song.name);
			var nextSong = Songs.findOne({timeAdded: {$gt: player.song.timeAdded}});

			if (nextSong) {
				//delay some time so that calling play on the next song can work
				setTimeout(function() {
					playSong(nextSong);
				}, 500);
			} else {
				console.log('No more song to play');
			}
		}
	});

	Template.body.events({
		'change #show-all-chk': function(event) {
			var checkbox = event.currentTarget;
			if (checkbox.checked) {
				Session.set('showAll', true);
			} else {
				Session.set('showAll', false);
			}
		},

		'submit #js-add-song-form': function(event) {
			if (Session.equals('urlFetching', true)) {
				return;
			}

			event.preventDefault();
			var submitData = $(event.currentTarget).serializeArray();
			var songurl;

			Session.set('urlFetching', true);

			for (var i = 0; i < submitData.length; i++) {
				if (submitData[i].name === 'songurl') {
					songurl = submitData[i].value;
				}
			}

			//call server
			Meteor.call('getSongInfo', songurl, function(error, result) {
				console.log('getSongInfo callback:', result);
				if (error) {
					alert('Cannot add the song at:\n' + songurl + '\nReason: ' + error.reason);
					this.$('#songurl').val('');
				}

				// clear input field after inserting has done
				$(event.currentTarget).find('[name="songurl"]').val('');

				Session.set('urlFetching', false);
			});
		},

		'click .js-play-button': function(event) {
			var $playButton = $(event.currentTarget);
			console.log('$playButton', $playButton.hasClass('_play'));
			if ($playButton.hasClass('_play')) {
				_play();
			} else {
				_pause();
			}
		},

		'click .js-playlist-nav': function(event) {
			var $this = $(event.currentTarget);
			var tab = $this.attr('data-tab');

			Session.set('tab', tab);
			$this.closest('.playlist-nav--list').find('.playlist-nav--item').removeClass('_active');
			$this.addClass('_active');
		}
	});

	/*global MediaElementPlayer*/
	Meteor.startup(function() {
		// init the media player
		player = new MediaElementPlayer('#audio-player');
		var selected = Songs.findOne(Session.get('selectedSong'));
		if (selected) {
			selectSong(selected);
		}
	});

	/**
	 * Keep the media player have a selected song ready to play
	 * @param  {[type]} song [description]
	 * @return {[type]}      [description]
	 */
	function selectSong(song) { /* jshint ignore:line */
		if (player) {
			_pause();
			player.media.src = song.streamURL;
			player.song = song;
			document.title = 'NJ :: ' + song.name;
		}
	}

	/**
	 * Actually play the song
	 * @param  {[type]} song [description]
	 * @return {[type]}      [description]
	 */
	function playSong(song) { /* jshint ignore:line */
		console.log('to play:', song);

		var prevId = Session.get('selectedSong');
		Session.set('selectedSong', song._id);

		AppStates.updatePlayingSongs(song._id, prevId);
		selectSong(song);

		_play();
	}

	function _play() {
		var $playButton = $('.js-play-button');
		$playButton.removeClass('_play').addClass('_pause');
		player.play();
	}

	function _pause() {
		var $playButton = $('.js-play-button');
		$playButton.removeClass('_pause').addClass('_play');
		player.pause();
	}
}

if (Meteor.isServer) {
	var Future = Npm.require('fibers/future');

	Meteor.startup(function() {

		// On server startup, create initial appstates if the database is empty.
		if (AppStates.find({key: 'playingSongs'}).count() === 0) {
			//first time running
			AppStates.insert({
				key: 'playingSongs',
				songs: []
			});
			console.log('Insert AppStates.playingSongs key');
		}

	});

	Meteor.methods({
		// this method is dangerous, disable for now
		// removeAllSongs: function() {
		// 	return Songs.remove({});
		// },

		/*global getSongInfoNct, getSongInfoZing*/
		getSongInfo: function(songurl) {
			// Set up a future for async callback sending to clients
			var songInfo;
			var fut = new Future();

			if (String(songurl).contains('nhaccuatui')) {
				console.log('Getting NCT song info');
				songInfo = getSongInfoNct(songurl);
			} else if (String(songurl).contains('mp3.zing')) {
				console.log('Getting Zing song info');
				songInfo = getSongInfoZing(songurl);
			}

			if (songInfo.streamURL) {
				fut['return'](Songs.insert(songInfo));
			} else {
				//songInfo is error object
				throw new Meteor.Error(403, songInfo.error);
				fut['return'](null);
			}

			return fut.wait();
		}
	});
}
// ============================================================================

/**
 * String.prototype.contains polyfill
 */
if ( !String.prototype.contains ) {
	String.prototype.contains = function() {
		return String.prototype.indexOf.apply( this, arguments ) !== -1;
	};
}

/**
 * AppStates helper: update playing songs, from any clients
 *
 * NOTE: this is an extremely naive solution to show playing state of songs
 * Any clients will override the playing state and there are high chance
 * playing states are not cleaned up properly
 *
 * This is temporary solution, until I manage to upgrade this app
 * to Meteor 1.2+ and integrate a more sophisticated users managing
 *
 * @param  {String} played  next play song ID
 * @param  {String} stopped previously played, and now stopped song ID
 */
AppStates.updatePlayingSongs = function(played, stopped) {
	var playingSongs = AppStates.findOne({key: 'playingSongs'});
	var songs = playingSongs.songs;
	if (!Array.isArray(songs)) {
		songs = playingSongs.songs = [];
	}

	var removedIdx = songs.indexOf(stopped);

	if (removedIdx !== -1) {
		songs.splice(removedIdx, 1);
	}

	if (songs.indexOf(played) === -1) {
		songs.push(played);
	}

	// update the exact document in AppStates collection with new songs array
	AppStates.update(playingSongs._id, {key: 'playingSongs', songs: songs});
};
