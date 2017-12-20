import React, { Component } from 'react';
// import PropTypes from 'prop-types';
import { Container } from 'flux/utils';
import TabNav from './TabNav';
import AppStore from '../events/AppStore';
import UserStore from '../events/UserStore';
import TabSongs from './TabSongs';
import TabUsers from './TabUsers';
import TabTopSongs from './TabTopSongs';
// import PopUpLyric from './PopUpLyric';

class AppBody extends Component {
	static getStores() {
		return [AppStore, UserStore];
	}

	static calculateState(prevState) {
		return {
			tabIndex: AppStore.getState()['tabIndex'],
		};
	}

	_renderTabItem = () => {
		const index = this.state.tabIndex;

		switch (index) {
			case 0:
			case 1:
			case 2:
				return (<TabSongs typeSong={index} />);
			case 3:
				return (<TabTopSongs />);
			case 4:
				return (<TabUsers />);
			default:
				return (<TabSongs />);
		}
	}

	render() {


		return (
			<main className="tab">
				<TabNav />
				{/* <PopUpLyric /> */}
				<div className="app-body__container">
					{ this._renderTabItem() }
				</div>
			</main>
		);
	}
}

export default Container.create(AppBody);
