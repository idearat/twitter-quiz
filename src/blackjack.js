/**
* @fileoverview Implements a standard blackjack game.
*
* NOTE that the implementation here attempts to both solve the stated challenge
* and use a variety of techniques and approaches for skill assessment purposes.
*
* @author Scott Shattuck (ss)
*/

/*jslint anon:true, nomen:true, plusplus:true */
/*globals d3, $, StateMachine */

(function(root) {

'use strict';

//  --------------------------------------------------------------------------- 
//	Setup
//  --------------------------------------------------------------------------- 

var B,			// The global namespace for our game components.
	DEBUG;		// Debugging state flag. Set via http://{path}/#debug.


/**
 * The global namespace object for our game. This object is the only one
 * exported directly. All testable objects are attached to the namespace.
 * @type {Object}
 */
B = {};


/**
 * Flag for turning on debugging output to the Javascript console. This flag is
 * set onload by checking the application URL for #debug or &debug=true.
 * Note that normally we wouldn't use all caps for a non-constant value, but we
 * want DEBUG to stand out in code.
 * @type {boolean}
 */
DEBUG = false;


// Trap uncaught exceptions that might try to slip past us.
if (window) {
	window.onerror = function(msg, url, line) {
		log('ERROR @ ' + url + '[' + (line || 0) + '] - ' + msg);
		return true;
	};
}


/*
 * Log to both the JavaScript console and to the application status bar. Logging
 * to the application's web UI assumes an element with an ID of #log.
 * @param {String} msg The message to log.
 */
function log(msg) {
	var elem;

	console.log(msg);
	elem = $('#log');
	if (elem) {
		elem.html(msg);
	}
}

//  --------------------------------------------------------------------------- 
//  Printable Mixin
//  --------------------------------------------------------------------------- 

/**
 * A simple mixin for card-printing support. Leveraged by Hand, Deck, and Shoe.
 *
 * Note that consumers of the mixin must implement a getCards method returning
 * an Array of B.Card instances.
 */
B.Printable = {

	/**
	 * Prints the cards of the receiver via the Card print method.
	 * @return {B.Printable} The receiver.
	 */
	print: function() {
		var cards,
			arr;

		arr = [];
		cards = this.getCards();
		cards.map(function(card) {
			arr.push(card.print());
		});

		return arr.join();
	}
};

//  --------------------------------------------------------------------------- 
//  Shuffler Mixin
//  --------------------------------------------------------------------------- 

/*
 * The Shuffler mixin is used as a simple way to factor a common shuffle
 * routine out of Deck and Shoe to allow them to share it without inheritance.
 *
 * Consumers of the mixin must implement a getCards() method which returns an
 * array and must manage the shuffled property to ensure it is false whenever
 * they dirty their card array.
 */


/**
 * A simple mixin for common shuffling algorithm support. The shuffling
 * algorithm here is a Fisher-Yates shuffle.
 * See http://bost.ocks.org/mike/shuffle for a live example and discussion.
 */
B.Shuffler = {

	/**
	 * A flag denoting whether the card collection is currently sorted.
     * @type {boolean}
	 */
	shuffled: false,


	/**
	 * Shuffles the card collection to produce a random card order.
	 * @return {B.Shuffler} The receiver.
	 */
	shuffle: function() {
		var cards,
			m,
			t,
			i;

		// Dependency here on the consumer to dirty shuffled as needed.
		if (this.shuffled) {
			return this;
		}

		// Dependency here on the consumer to implement getCards.
		cards = this.getCards();
		m = cards.length;

		while (m) {
			i = Math.floor(Math.random() * m--);
			t = cards[m];
			cards[m] = cards[i];
			cards[i] = t;
		}

		this.shuffled = true;

		return this;
	}
};


//  --------------------------------------------------------------------------- 
//  Cards / Decks / Shoes
//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Card object is implemented as a largely encapsulated constructor
 * which has the benefit of making Card values read-only (you can't change
 * the value of a card) at the expense of additional overhead due to each card
 * having its own getter functions. To avoid truly excessive overhead the label
 * and symbol lookup tables are external to the instance. This does make it
 * possible for a card to report incorrect label/symbol information if one were
 * to alter these more exposed lookup tables or the methods which access them.
 * The internal card index values remain unchanged in any event.
 */


/**
 * A card instance. Normally card instances are not created directly but are
 * produced from within the context of a Deck.
 * @param {number} index The card index from 1 to 13 (Ace to King).
 * @param {number} suit The card suit from 1 to 4 (H, C, D, S).
 * @return {B.Card} A new card instance.
 * @constructor
 */
B.Card = function(index, suit) {
	var i,
		s;

	// Validate index.
	if (index < 1 || index > 13) {
		throw new Error('Invalid card index: ' + index);
	}
	i = index;

	// Validate suit.
	if (suit < 1 || suit > 4) {
		throw new Error('Invalid card suit: ' + suit);
	}
	s = suit;


	/**
	 * Return the numerical index of the card.
	 * @return {number} The index from 1 to 13.
	 */
	this.getIndex = function() {
		return i;
	};


	/**
	 * Return the numerical suit index of the card from 0 to 3.
	 * @return {number} The suit index.
	 */
	this.getSuit = function() {
		return s;
	};


	/**
	 * Return the value of the card. Note that Aces will always return 11 while
	 * face cards (J, Q, K) all return 10. During scoring of Hand instances the
	 * Ace values are adjusted to 'soft' (1) values as needed.
	 */
	this.getValue = function() {
		if (i === 1) {
			return 11;
		} else if (i > 10) {
			return 10;
		} else {
			return i;
		}
	};
};


/**
 * The labels of the various cards by value index.
 * @type {Array.<string>}
 */
B.Card.LABELS = [null,	// Don't use 0 index.
	'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'
];


/**
 * The names and Unicode symbols for the various suits in "new deck order",
 * Hearts, Clubs, Diamonds, Spades (aka suit index).
 * @type {Array.<object>}
 */
B.Card.SUITS = [null,	// Don't use 0 index.
	{ name: 'Hearts', symbol: '\u2661' },
	{ name: 'Clubs', symbol: '\u2663' },
	{ name: 'Diamonds', symbol: '\u2662' },
	{ name: 'Spades', symbol: '\u2660' }
];


/**
 * Hole card state. By default cards deal face-up, but not hole cards.
 * @type {boolean}
 */
B.Card.prototype.holeCard = false;


/**
 * Return the text label for the card, such as 'A' for an Ace.
 * @return {string} The string label of the card.
 */
B.Card.prototype.getLabel = function() {
	return B.Card.LABELS[this.getIndex()];
};


/**
 * Return the suit name, ie. Hearts, Diamonds, etc.
 * @return {string} The suit name.
 */
B.Card.prototype.getSuitName = function() {
	return B.Card.SUITS[this.getSuit()].name;
};


/**
 * Return the suit symbol, the Unicode value for the suit name.
 * @return {string} The suit symbol.
 */
B.Card.prototype.getSymbol = function() {
	return B.Card.SUITS[this.getSuit()].symbol;
};


/**
 * Prints the card's label/symbol pair to the console.
 * @return {B.Card} The receiver.
 */
B.Card.prototype.print = function() {
	return this.getLabel() + this.getSymbol();
};


/**
 * Combined setter/getter for the hole card flag.
 * @param {boolean} flag The new value for the holdCard property.
 * @return {boolean} The current setting, after optional flag update.
 */
B.Card.prototype.isHoleCard = function(flag) {
	if (flag !== undefined) {
		this.holeCard = flag;
	}

	return this.holeCard;
};


//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Deck object is a fully-encapsulated constructor function. The
 * actual card instance creation as well as the card array itself are protected
 * from tampering except through methods on the Deck. Deck mixes in Shuffler to
 * provide a means for shuffling a Deck and Printable to support printing.
 *
 * Why a true Deck of Card instances? Admittedly there's a bit of overhead in
 * creating objects rather than just driving things from a random number
 * generator. Still, for the game to function properly it's important that no
 * card be used twice in a single-deck game, but could be if the game were
 * changed to a multi-deck game. The most sensible thing that allows for future
 * expansion is to accept real Card instances since 52 objects * a deck count
 * shouldn't overburden modern web browsers. Card instances also make some of
 * the computations for card values, printing, etc. far more encapsulated.
 */


/**
 * A deck of cards. Note that the default order of cards in the deck matches
 * that of a physical deck of cards. In particular, the card order from top to
 * bottom (aka first to last card in the deck) is Ace through King of Hearts,
 * Ace through King of Clubs, King through Ace of Diamonds, and King through Ace
 * of Spades. Note that the order of suits changes in mid-deck.
 */
B.Deck = function() {
	var i,
		j,
		n,
		cards;

	cards = [];

	// First two suits run from Ace to King. Last two suits run from King to
	// Ace.
	for (i = 1; i < 5; i++) {
		for (j = 1; j < 14; j++) {
			n = i < 3 ? j : 14 - j;
			cards.push(new B.Card(n, i));
		}
	}

	/**
	 * Return the array of Card instances which make up the deck. Note that the
	 * array returned is mutable, which is necessary for shuffling in place.
	 * @return {Array.<B.Card>} The card array.
	 */
	this.getCards = function() {
		return cards;
	};

	return this;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Deck.prototype, B.Printable);

// Mix in Shuffler so we get 'shuffled' and 'shuffle' behavior.
$.extend(B.Deck.prototype, B.Shuffler);

//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Shoe object is responsible for dealing the cards. Like a Deck, a
 * Shoe is a collection of cards so we mix in both print and shuffle ability.
 * Like our other constructors we have a mix of private vars/getters and more
 * public methods. The reason for the mix is to help minimize how many copies of
 * functions we're creating as a side-effect of instance creation.
 */


/**
 * A "shoe", the container for one or more decks of cards which are shuffled
 * and dealt for the game.
 * @param {number} size The number of decks in the shoe. The default is
 *     B.Shoe.DEFAULT_SIZE.
 */
B.Shoe = function(size) {
	var cards,
		decks;

	/**
	 * The array of Cards in the shoe. The card list is built from the
	 * individual decks which are added to the shoe.
	 * @type {Array.<B.Card>}
	 */
	cards = [];


	/**
     * The number of Decks this Shoe holds.
	 * @type {number}
	 */
	decks = size || B.Shoe.DEFAULT_SIZE;


	/**
	 * Returns the internal cards array. Note that since the array is
	 * mutable and passed by reference its contents can be modified by
	 * consumers. This is a necessary requirement for shuffling.
	 * @return {Array.<B.Card>} The cards in the shoe.
	 */
	this.getCards = function() {
		return cards;
	};


	/**
     * Returns the number of decks this shoe holds. 
	 * @return {number}
	 */
	this.getSize = function() {
		return decks;
	};


	// Force the shoe to fill.
	this.fill();

	return this;
};


/**
 * The default number of decks in a new Shoe.
 * @type {number}
 */
B.Shoe.DEFAULT_SIZE = 1;


/**
 * Adds a deck to the shoe. This operation does not instantly result in a
 * shuffle. The shoe will only shuffle if it is "unshuffled" and is asked to
 * deal a card.
 * @param {B.Deck} deck A deck of cards.
 * @return {B.Shoe} The receiver.
 */
B.Shoe.prototype.addDeck = function(deck) {
	var cards;

	// Note the mixin property update here for B.Shuffler.
	this.shuffled = false;

	cards = this.getCards();

	// Use apply here to flatten the incoming deck's cards into the
	// receiver, otherwise we'll end up with an array of array of cards.
	cards.push.apply(cards, deck.getCards());

	return this;
};


/**
 * Fills the shoe. An extension here to provide incoming cards as a
 * parameter might allow this type to support Continuous Shuffle by adding
 * the discard pile after each hand and allowing deal()'s natural shuffle
 * triggering to run.
 * @return {B.Shoe} The receiver.
 */
B.Shoe.prototype.fill = function() {
	var i,
		count,
		cards;

	// For continuous shuffling we'd remove this check.
	cards = this.getCards();
	if (cards.length !== 0) {
		throw new Error('Invalid operation. Cannot fill unless empty.');
	}

	count = this.getSize();
	for (i = 0; i < count; i++) {
		this.addDeck(new B.Deck());
	}

	return this;
};


/**
 * Deals a single card from the shoe. This reduces the number of cards in the
 * shoe by one. If the shoe is empty when this method is called the shoe is
 * filled, shuffled, and a new card is vended from the resulting card stack.
 * @param {boolean} holeCard True if the vended card is meant as a hole card.
 */
B.Shoe.prototype.getCard = function(holeCard) {
	var cards,
		card;

	// Shuffle won't actually shuffle if the receiver is already shuffled.
	this.shuffle();

	cards = this.getCards();

	// Return the first card in the cards collection, reducing the cards in
	// the shoe by one.
	card = cards.shift();

	// If we're out of cards we have to fill and vend from the fresh list.
	if (!card) {
		this.fill();
		return this.getCard();
	}

	// Update state of card if this is supposed to be a hole card (face down).
	if (holeCard) {
		card.isHoleCard(true);
	}

	return card;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Shoe.prototype, B.Printable);


// Mix in Shuffler so we get 'shuffled' and 'shuffle' behavior.
$.extend(B.Shoe.prototype, B.Shuffler);


//  --------------------------------------------------------------------------- 
//  Hand / Player / Dealer
//  --------------------------------------------------------------------------- 

/**
 * A Hand of cards. The hand actually owns the cards and bet, while the hand's
 * owner is responsible for betting strategy and requirements (must hit, etc).
 * @param {B.Owner} person The owner of this particular hand of cards.
 * @return {B.Hand} The new instance.
 * @constructor
 */
B.Hand = function(person) {
	var cards,
		owner,
		bet;


	/**
     * The current bet amount. Defaults to the player's minimum bet value.
     * @type {number}
     */
	bet = person.getMinimumBet();


	/**
     * The array of cards in the hand.
	 * @type {Array.<B.Card>}
     */
	cards = [];


	/**
     * The "owner" of the hand. The owner is responsible for making decisions
	 * about the hand but is also where a hand gets its state machine.
	 * @type {B.Owner}
	 */
	owner = person;


	/**
     * Adds a card to the hand, provided that the current state allows it.
	 * @param {B.Card} card The new card to add to the hand.
	 * @return {B.Hand} The receiver.
	 */
	this.addCard = function(card) {
		cards.push(card);

		// Don't bother with overhead of scoring until we've got at least two
		// cards.
		if (cards.length < 3) {
			return this;
		}

		// With every new card we test and invoke the bust() event if the card
		// has pushed us over our limit.
		if (this.getScore() > 21) {
			this.bust();
		}

		return this;
	};


	/**
     * Invoked when the hand's score exceeds 21. The hand's owner is notified
	 * via their 'bust' method, with the current hand as the only parameter.
	 */
	this.bust = function() {
		owner.bust(this);
	};


	// TODO
	this.double = function() {
	};


	/**
	 * Return the array of Card instances which make up the hand. For a hand the
	 * array returned is a copy to ensure the Hand cannot be modified.
	 * @return {Array.<B.Card>} The card array.
	 */
	this.getCards = function() {
		return cards.slice();
	};


	/**
     * Returns the state machine which controls the state of the hand.
	 * @return {StateMachine} The StateMachine which controls the state of this
	 *     hand.
	 */
	this.getFSM = function() {
		return owner.getFSM();
	};


	/**
     * Returns the score of the hand. When aces are included in the hand they
	 * are counted as 11 unless such a count would cause the hand to bust, in
	 * which case they are counted as 1.
     * @return {number}
     */
	this.getScore = function() {
		var s,
			aces;

		s = 0;
		aces = 0;

		cards.map(function(card) {
			var value;

			value = card.getValue();
			if (value === 11) {
				aces++;
				return;
			}
			s += value;
		});

		while (aces--) {
			if (s + 11 + aces > 21) {
				s += 1;
			} else {
				s += 11;
			}
		}

		return s;
	};


	/**
     * Increases the amount bet on this hand. The final amount must not exceed
	 * the maximum bet limit for the owner of the hand.
	 * @param {number} amount The amount to increase the bet by.
     */
	this.increaseBet = function(amount) {
		if ((bet + amount) > owner.getMaximumBet()) {
			throw new Error('Bet exceeds maximum.');
		}

		bet += amount;
	};


	/**	
     * Adjusts the owners holdings down by the amount of the current hand's bet.
     */
	this.lose = function() {
		owner.adjustHoldings(bet * -1);
	};


	/**	
     * Pays the owner of the hand based on the current bet and the odds
	 * provided. The odds default to 3:2 per typical Blackjack standards.
	 * @param {number} odds The multiplier for the odds. For example, odds of
	 *     3:2 would be passed as 1.5 to this method.
     */
	this.pay = function(odds) {
		owner.adjustHoldings(bet * (odds || 1.5));
	};


	// TODO
	this.split = function() {
	};


	/**	
     * Adjusts the owners holdings down by half the amount of the current
	 * hand's bet. The hand is forfeited and cannot be played further.
     */
	this.surrender = function() {
		owner.adjustHoldings(bet * -0.5);
	};


	// Mix in Printable so we can print our card array on demand.
	$.extend(this, B.Printable);


	return this;
};

//  --------------------------------------------------------------------------- 

/**
 * @constructor
 */
B.Owner = function() {
};


B.Owner.prototype.init = function(game) {
};


/**
 * Adjustes the receiver's holdings by the amount provided. This method is
 * typically invoked when a Hand owned by the receiver is resolved (either pays
 * out or loses/busts).
 * @param {number} amount The amount to adjust holdings by.
 */
B.Owner.prototype.adjustHoldings = function(amount) {
	this.holdings += amount;
};


/**
 * Handles cases where a specific Hand has busted.
 */
B.Owner.prototype.bust = function(hand) {
	log('hand busted: ' + hand.print());
};


/**
 * Returns the state machine which defines the rules this Hand owner must
 * follow with respect to each hand they control.
 */
B.Owner.prototype.getFSM = function() {
	return this.fsm;
};


/**
 * Returns the Game the receiver is playing or dealing in.
 * @return {B.Game} The game this owner is participating in.
 */
B.Owner.prototype.getGame = function() {
	return this.game;
};


/**
 * Returns the maximum bet the owner can make. This is typically the smaller of
 * the owner's holdings or the table (aka game) maximum.
 * @return {number} The maximum bet amount.
 */
B.Owner.prototype.getMaximumBet = function() {
	return Math.min(this.getGame().getMaximumBet(),
					this.getHoldings());
};


/**
 * Returns the minimum bet the owner can make. This is typically the table
 * minimum. If the owner's holdings are smaller than the minimum they can't bet
 * at the table any longer (without buying more chips).
 */
B.Owner.prototype.getMinimumBet = function() {
	return this.getGame().getMinimumBet();
};


// TODO
B.Owner.prototype.onhitme = function() {
};


// TODO
B.Owner.prototype.onstand = function() {
};


// TODO:	not enough money to play? exit or buy chips...


//  --------------------------------------------------------------------------- 

/**
 * A Player.
 * Players "own" and hence play one or more Hands. By default a player will 
 * have a single hand, but can expand that through splits.
 * @param {B.Game} g The game the player is in.
 * @param {number} h The holdings the player starts with.
 * @constructor
 */
B.Player = function(g, h) {
	var game,
		holdings;

	// Validate game instance.
	if (!g) {
		throw new Error('Invalid Game');
	}

	// Validate holdings.
	if (!h) {
		throw new Error('Invalid Holdings');
	}

	/**
	 * The game this player is a part of.
	 * @type {B.Game}
	 */
	game = g;


	/**
	 * The number of chips the player has left.
	 * @type {number}
	 */
	holdings = h;


	/**
	 * Returns the game this Player is part of.
	 * @return {B.Game} The game.
	 */
	this.getGame = function() {
		return game;
	};


	/**
	 * Returns the number of chips the player has left.
	 * @return {number} The number of chips.
	 */
	this.getHoldings = function() {
		return holdings;
	};


	return this;
};


// Define Player to be a kind-of Owner.
B.Player.prototype = new B.Owner();


//  --------------------------------------------------------------------------- 

/**
 * The Dealer.
 * Dealers "own" a single hand, and that hand is the comparison point for all
 * other hands in the game during payout calculations. The rules which apply to
 * a dealer with respect to their hand differ from those of normal players.
 * @constructor
 */
B.Dealer = function(g) {
	var game;

	/**
	 * The game this player is a part of.
	 * @type {B.Game}
	 */
	game = g;

	/**
	 * Returns the game this Dealer is part of.
	 * @return {B.Game} The game.
	 */
	this.getGame = function() {
		return game;
	};


	return this;
};


// Define Dealer to be a kind-of Owner.
B.Dealer.prototype = new B.Owner();


//  --------------------------------------------------------------------------- 
//  Game
//  --------------------------------------------------------------------------- 

/**
 * A blackjack game instance. The options provided define rough parameters and
 * limits for the game.
 * @param {object} options Optional game control parameters. 
 */
B.Game = function(options) {
	var opts;

	/**
	 * An optional object whose key/value pairs provide configuration data.
	 * @type {object}
	 */
	opts = options;


	/**
	 * Returns any startup configuration options for the game.
	 * @return {object} Startup options.
	 */
	this.getOptions = function() {
		return opts;
	};


	this.init(opts);

	return this;
};


/**
 * A Dictionary of default values for the class.
 * @enum {object}
 */
B.Game.DEFAULT = {
	HOLDINGS: 500,			// Default is 500 chips.
	MAXIMUM_BET: 100,		// No more than 100 chips per hand.
	MINIMUM_BET: 1,			// 1 chip minimum.
	PLAYER_COUNT: 1			// 1 player by default.
};


/**
 * The dealer for the game.
 * @type {B.Dealer}
 */
B.Game.prototype.dealer = null;


/**
 * The dealer's hand. We hold this hand separate for easy comparison. Note that
 * we don't split dealer hands.
 * @type {B.Hand}
 */
B.Game.prototype.dealerHand = null;


/**
 * The state machine which controls overall game flow.
 * @type {StateMachine}
 */
B.Game.prototype.fsm = null;


/**
 * A list of all player hands currently active. This list can be larger than the
 * number of active players due to hand splitting.
 * @type {Array.<B.Hand>}
 */
B.Game.prototype.hands = null;


/**
 * The default holdings for players in the game.
 * @type {number}
 */
B.Game.prototype.holdings = B.Game.DEFAULT.HOLDINGS;


/**
 * The maximum bet for this game instance.
 * @type {number}
 */
B.Game.prototype.maxBet = B.Game.DEFAULT.MAXIMUM_BET;


/**
 * The minimum bet for this game instance.
 * @type {number}
 */
B.Game.prototype.minBet = B.Game.DEFAULT.MINIMUM_BET;


/**
 * The players for the game.
 * @type {Array.<B.Player>}
 */
B.Game.prototype.players = null;


/**
 * The number of players in the game.
 * @type {number}
 */
B.Game.prototype.playerCount = B.Game.DEFAULT.PLAYER_COUNT;


/**
 * The Shoe used to deal cards for the game.
 * @type {B.Shoe}
 */
B.Game.prototype.shoe = null;


/**
 * Returns the dealer for the game.
 * @return {B.Dealer} The dealer.
 */
B.Game.prototype.getDealer = function() {
	return this.dealer;
};


/**
 * Returns the maximum value a player can bet for this game.
 * @return {number} The maximum bet.
 */
B.Game.prototype.getMaximumBet = function() {
	return this.maxBet;
};


/**
 * Returns the minimum value a player can bet for this game.
 * @return {number} The minimum bet.
 */
B.Game.prototype.getMinimumBet = function() {
	return this.minBet;
};


/**
 * Returns the number of active players in the game.
 * @return {number} The player count.
 */
B.Game.prototype.getPlayerCount = function() {
	return this.playerCount;
};


/**
 * Returns the shoe being used to deal cards.
 * @return {B.Shoe} The game's shoe.
 */
B.Game.prototype.getShoe = function() {
	return this.shoe;
};


/**
 * Initializes the game instance.
 * @param {object} options Optional game options.
 */
B.Game.prototype.init = function(options) {
	var i,
		count;

	if (options) {
		this.holdings = options.holdings || this.holdings;
		this.maxBet = options.max || this.maxBet;
		this.minBet = options.min || this.minBet;
		this.playerCount = options.players || this.playerCount;
	}

	this.fsm = this.initFSM();

	this.shoe = new B.Shoe();

	this.dealer = new B.Dealer(this);

	this.players = [];
	count = this.getPlayerCount();
	for (i = 0; i < count; i++) {
		this.players.push(new B.Player(this, this.holdings));
	}

	this.hands = [];

	return this;
};


/**
 * Initialize the state machine which embodies the game state and transitions.
 * @return {StateMachine} The newly created/initialized state machine.
 */
B.Game.prototype.initFSM = function() {
	var fsm;

	// Initialize a state machine for overall game flow.
	fsm = StateMachine.create({
		initial: 'pregame',
		events: [
			{ name: 'deal', from: ['pregame', 'postgame'], to: 'dealing' },

			{ name: 'play', from: 'dealing', to: 'player' },
			{ name: 'play', from: 'player', to: 'dealer' },

			{ name: 'bust', from: 'player', to: 'player.bust'},
			{ name: 'bust', from: 'dealer', to: 'dealer.bust'},

			{ name: 'payout', from: '*', to: 'postgame' },

			{ name: 'quit', from: 'postgame', to: 'done' }
		]});

	// Connect the various FSM transition hooks to game methods.
	fsm.onafterdeal = this.onafterdeal.bind(this);

	fsm.onbust = this.onbust.bind(this);
	fsm.onpayout = this.onpayout.bind(this);
	fsm.onplay = this.onplay.bind(this);
	fsm.onquit = this.onquit.bind(this);

	if (DEBUG) {
		log('initialized game state');
	}

	return fsm;
};


/**
 */
B.Game.prototype.render = function() {
};


/**
 * Start a new game, triggering initial rendering and dealing to start a hand.
 */
B.Game.prototype.start = function() {

	// Render the game board baseline.
	this.render();

	// Deal the initial cards.	
	this.fsm.deal();
};


/**
 * Handles state transition after the initial deal for a new game is done. While
 * the first two cards are being dealt to each player no UI actions are allowed.
 * Once the initial deal has completed the game moves into "player" mode in
 * which the player's state machine is in control of one or more hands.
 */
B.Game.prototype.onafterdeal = function() {
	var shoe,
		my;

	// Capture this for lazy 'bind' via closure.
	my = this;
	shoe = this.getShoe();

	this.dealerHand = new B.Hand(this.dealer);

	// Create an initial hand for each player.
	this.hands.length = 0;
	this.players.map(function(player) {
		// NOTE the my reference here to outer scope 'this'.
		my.hands.push(new B.Hand(player));
	});

	// Now that we have the hands built we need to deal them some cards in the
	// proper order.
	this.hands.map(function(hand) {
		hand.addCard(shoe.getCard());
	});
	this.dealerHand.addCard(shoe.getCard());

	this.hands.map(function(hand) {
		hand.addCard(shoe.getCard());
	});

	// NOTE that in European / Australian rules we might not deal this second
	// card. Even when we do, we request this card as a hole card.
	this.dealerHand.addCard(shoe.getCard(true));

	if (DEBUG) {
		log('the deal is done');
	}

	// Initiate play for all player's hands.
	this.fsm.play();
};


// TODO
B.Game.prototype.onbust = function() {
	switch (this.fsm.current) {
	case 'player.bust':
		log('game: player busted.');
		break;
	case 'dealer.bust':
		log('game: dealer busted.');
		break;
	default:
		break;
	}
};


// TODO
B.Game.prototype.onpayout = function() {
};


/**
 */
// TODO
B.Game.prototype.onplay = function() {
	switch (this.fsm.current) {
	case 'player':
		// Play all hands other than the dealer's.
		log('playing hands: ');
		this.hands.map(function(hand) {
			log(hand.print());
		});
		break;
	case 'dealer':
		// Play the dealer's hand.
		break;
	default:
		break;
	}
};


// TODO
B.Game.prototype.onquit = function() {
};

//  --------------------------------------------------------------------------- 
//  Application Bootstrap
//  --------------------------------------------------------------------------- 

/**
 * Initializes the game and starts it.
 * @param {object} options Optional game configuration options.
 */
B.init = function(options) {

	DEBUG = window.location.href.toString().match(/#debug|&debug=true/);
	if (DEBUG) {
		log('Debugging output enabled.');
	}

	B.game = new B.Game(options);
	B.game.start();
};

//  --------------------------------------------------------------------------- 
//	Export
//  --------------------------------------------------------------------------- 


//  Export B using variant cribbed from underscore.js. The goal is to ensure
//  export works across all containers.
if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = B;
    }
    exports.B = B;
} else {
    root.B = B;
}

}(this));
