import React, { Component } from 'react';
import { Container } from 'flux/utils';
import ReactGA from 'react-ga';

import AppStore from '../events/AppStore';
import * as AppActions from '../events/AppActions';

class ButtonPlay extends Component {
	static getStores() {
		return [AppStore];
	}

	static calculateState(/*prevState*/) {
		return {
			activeBtnPlay: AppStore.getState()['activeBtnPlay'],
			selectedSong: AppStore.getState()['selectedSong'],
		};
	}

	toggleButton = () => {
		if (!this.state.selectedSong) {
			return;
		}

		if (this.state.activeBtnPlay) {
			AppActions.deactiveBtnPlay();
			ReactGA.event({
				category: 'Playlist',
				action: 'Stop playing a song (by click)',
			});
		} else {
			AppActions.activeBtnPlay();
			ReactGA.event({
				category: 'Playlist',
				action: 'Start playing a song (by click)',
			});
		}
	};

	render() {
		return (
			<li className="navbar__item">
				<div
					className={`play-button play-button--play ${this.state.activeBtnPlay ? 'play-button--pause' : ''}`}
					onClick={this.toggleButton}
				>
					<div className="play-button__item play-button__top" />
					<div className="play-button__item play-button__right" />
					<div className="play-button__item play-button__bottom" />
					<div className="play-button__item play-button__left" />
				</div>
			</li>
		);
	}
}

export default Container.create(ButtonPlay);
