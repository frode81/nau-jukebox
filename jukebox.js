/**
 * Main module
 */
/*eslint no-shadow:0*/
/*global Songs:true, AppStates:true, moment*/

// Set up a collection to contain song information. On the server,
// it is backed by a MongoDB collection named 'songs'.

Songs = new Meteor.Collection('songs');
AppStates = new Meteor.Collection('appstates');

if (Meteor.isClient) {
	var nickname = localStorage.getItem('nickname') || '';
	Session.setDefault('urlFetching', false);
	Session.setDefault('showAll', false);
	Session.setDefault('tab', 'tab--play-list');
	Session.setDefault('nickname', nickname);
	Session.setDefault('selectedIndex', '0');

	var player; //the MediaElement instance

	var submitSong = function(songurl) {
		var nickname = Session.get('nickname');
		Meteor.call('getSongInfo', songurl, nickname, function(error/*, result*/) {
			if (error) {
				alert('Cannot add the song at:\n' + songurl + '\nReason: ' + error.reason);
				$('[name="songurl"]').val('');
			}

			// clear input field after inserting has done
			$('[name="songurl"]').val('');
			Session.set('urlFetching', false);
		});
	};

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
					songList.observeChanges({
						added: function(id/*, fields*/) {
							console.log('songList added', id);
						}
					});
					break;

				case 'tab--yesterday':
					var yesterday = moment().add(-1, 'days').toDate();
					yesterday.setHours(0, 0, 0, 0);
					songList = Songs.find(
						{timeAdded: {$gt: yesterday.getTime(), $lt: earlyOfToday.getTime()}},
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
			return Template.instance().addDateFromNow.get();
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

	Template.song.created = function() {
		var self = this;

		this.momentTime = moment(this.data.timeAdded);
		this.addDateFromNow = ReactiveVar(this.momentTime.fromNow());

		this.handle = Meteor.setInterval((function() {
			self.addDateFromNow.set(self.momentTime.fromNow());
		}), 1000*60);
	};

	Template.song.destroyed = function() {
		Meteor.clearInterval(this.handle);
	};

	Template.body.helpers({
		getNickname: function() {
			return Session.get('nickname');
		},

		searchResult: function() {
			var searchResult = Session.get('searchResult') || [];
			var selectedIndex = Session.get('selectedIndex');

			if (selectedIndex >= 0 && selectedIndex < searchResult.length) {
				searchResult[selectedIndex]._active = '_active';
			}

			return searchResult;
		}
	});

	Template.songlist.events({
		'click #songurl': function(event) {
			event.currentTarget.select();
		}
	});

	Template.song.events({
		'click .js-song-item': function() {
			playSong(this);
		},

		'click .remove-btn': function(e) {
			Songs.remove(this._id);
			if (Session.equals('selectedSong', this._id)) {
				//selected song playing
				pauseWithEffect();
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
			submitSong(this.originalURL);
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
			if (songurl.indexOf('http') >= 0) {
				submitSong(songurl);
			}
		},

		'click .js-play-button': function(event) {
			var $playButton = $(event.currentTarget);
			console.log('$playButton', $playButton.hasClass('_play'));
			if ($playButton.hasClass('_play')) {
				playWithEffect();
			} else {
				pauseWithEffect();
			}
		},

		'click .js-playlist-nav': function(event) {
			var $this = $(event.currentTarget);
			var tab = $this.attr('data-tab');

			Session.set('tab', tab);
			$this.closest('.playlist-nav--list').find('.playlist-nav--item').removeClass('_active');
			$this.addClass('_active');
		},

		'focus .js-nickname-holder': function(/*e*/) {
			Session.set('nickname', '');
		},

		'keydown .js-nickname-holder': function(e) {
			console.log('e', e);
			if (e.keyCode === 13) {
				var $target = $(e.currentTarget);
				var value = $target.val();

				localStorage.setItem('nickname', value);
				Session.set('nickname', value);
				$target.blur();
			}
		},

		'keyup .js-search-box': function(e) {
			e.stopPropagation();
			e.preventDefault();

			var $target = $(e.currentTarget);
			var $form = $target.closest('.js-add-song-form');
			var value = $target.val();
			var searchResult = Session.get('searchResult') || [];
			var selectedIndex = Session.get('selectedIndex');
			if (selectedIndex > (searchResult.length - 1)) {
				selectedIndex = searchResult.length - 1;
				Session.set('selectedIndex', selectedIndex.toString());
			}

			if (e.keyCode === 38) { // up arrow
				if (selectedIndex > 0) {
					selectedIndex--;
					Session.set('selectedIndex', selectedIndex.toString());
					return;
				}
			}

			if (e.keyCode === 40) { // down arrow
				if (selectedIndex < (searchResult.length - 1)) {
					selectedIndex++;
					Session.set('selectedIndex', selectedIndex.toString());
					return;
				}
			}

			if (e.keyCode === 27) { // esc
				$target.val('');
				$form.removeClass('_active');

				if (value.length === 0) {
					$form.find('input').blur();
				}
				return;
			}

			if (e.keyCode === 13) { // enter
				var selectedSong = searchResult[selectedIndex];
				if (selectedSong) {
					submitSong(selectedSong.originalURL);
					$form.find('#songurl').val('').blur();
					$form.removeClass('_active');
					return false;
				}
			}

			if (value.length >= 3) {
				var data = Songs.find({searchPattern: {$regex: value.toLowerCase() + '*'}}, {limit: 7}).fetch();

				if (data.length > 0) {
					Session.set('searchResult', data);
					$form.addClass('_active');
				} else {
					Session.set('searchResult', []);
					$form.removeClass('_active');
				}
			} else {
				$form.removeClass('_active');
			}
		},

		'click .js-song-result--item': function(e) {
			var $target = $(e.currentTarget);
			var $form = $target.closest('.js-add-song-form');
			var songurl = $target.attr('data-href');

			$form.find('#songurl').val('');
			$form.removeClass('_active');

			//call server
			submitSong(songurl);
		},
	});

	/*global MediaElementPlayer*/
	Meteor.startup(function() {
		// init the media player
		player = new MediaElementPlayer('#audio-player');
		var selected = Songs.findOne(Session.get('selectedSong'));
		if (selected) {
			selectSong(selected);
		}

		$(document).on('keyup', function(e) {
			console.log('keypress', e.keyCode);
			var $form = $('.js-add-song-form');
			var $input = $form.find('input');

			switch (e.keyCode) {
				case 81: // q
					$input.focus();
					break;

				case 27: // esc
					$input.blur();
					$input.val('');
					$form.removeClass('_active');
					break;

				case 80: // p
					// toggle between play/pause
				default:
			}
		});
	});

	/**
	 * Keep the media player have a selected song ready to play
	 * @param  {[type]} song [description]
	 * @return {[type]}      [description]
	 */
	function selectSong(song) { /* jshint ignore:line */
		if (player) {
			pauseWithEffect();
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

		playWithEffect();
	}

	function playWithEffect() {
		var $playButton = $('.js-play-button');
		$playButton.removeClass('_play').addClass('_pause');
		player.play();
	}

	function pauseWithEffect() {
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

		/*global getSongInfoNct, getSongInfoZing*/
		getSongInfo: function(songurl, author) {
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

			songInfo.author = author;
			songInfo.searchPattern = songInfo.name.toLowerCase() + ' - ' + songInfo.artist.toLowerCase();

			if (songInfo.streamURL) {
				fut['return'](Songs.insert(songInfo));
			} else {
				fut['return'](null);
				//songInfo is error object
				throw new Meteor.Error(403, songInfo.error);
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
