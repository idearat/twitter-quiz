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
			i,
			start,
			end;

		// Dependency here on the consumer to dirty shuffled as needed.
		if (this.shuffled) {
			return this;
		}

		// Dependency here on the consumer to implement getCards.
		cards = this.getCards();
		m = cards.length;

		if (DEBUG) {
			start = (new Date()).getTime();
		}

		while (m) {
			i = Math.floor(Math.random() * m--);
			t = cards[m];
			cards[m] = cards[i];
			cards[i] = t;
		}

		this.shuffled = true;
		
		if (DEBUG) {
			end = (new Date()).getTime();
			log('Shuffled fresh shoe of ' + cards.length + ' cards in ' +
				(end - start) + 'ms.');
		}

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
 * Constructs a new Card instance and returns it. Normally Card instances are
 * not created directly but are produced from within the context of a Deck.
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
	if (this.isHoleCard()) {
		return '\u2300';
	} else {
		return this.getLabel() + this.getSymbol();
	}
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
 * Constructs a new, unshuffled, deck of Card instances. Note that the default
 * order of cards in the deck matches that of a physical deck of cards. In
 * particular, the card order from top to bottom (aka first to last card in the
 * deck) is Ace through King of Hearts, Ace through King of Clubs, King through
 * Ace of Diamonds, and King through Ace of Spades. Note that the order of suits
 * changes in mid-deck.
 * @return {B.Deck} A new Deck instance.
 * @constructor
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
 * Constructs a new Shoe instance and returns it. A "shoe" is the container for
 * one or more decks of cards which are shuffled and dealt for the game.
 * @param {number} size The number of decks in the shoe. The default is
 *     B.Shoe.DEFAULT_SIZE.
 * @return {B.Shoe} A new Shoe instance.
 * @constructor
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


// Mix in Printable so we can print our card array on demand.
$.extend(B.Shoe.prototype, B.Printable);


// Mix in Shuffler so we get 'shuffled' and 'shuffle' behavior.
$.extend(B.Shoe.prototype, B.Shuffler);


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
 * Deals a single card from the shoe. This reduces the number of cards in the
 * shoe by one. If the shoe is empty when this method is called the shoe is
 * filled, shuffled, and a new card is vended from the resulting card stack.
 * @param {boolean} holeCard True if the vended card is meant as a hole card.
 */
B.Shoe.prototype.deal = function(holeCard) {
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
		return this.deal();
	}

	// Update state of card if this is supposed to be a hole card (face down).
	if (holeCard) {
		card.isHoleCard(true);
	}

	return card;
};


/**
 * Fills the shoe. An extension here to provide incoming cards as a
 * parameter might allow this type to support Continuous Shuffle by adding
 * the discard pile after each Hand and allowing deal()'s natural shuffle
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


//  --------------------------------------------------------------------------- 
//  Players / Hands
//  --------------------------------------------------------------------------- 

/*
 * NOTE: Player instances associate a set of holdings with a set of Hands. The
 * player manages holdings while Hands escrow their bets. If a Hand wins, pushes,
 * pays insurance, or is surrendered, the payout (usually bet * odds) is added to
 * the player's holdings. If a Hand busts or loses the escrowed amount of the
 * bet is simply discarded.
 */


/**
 * Constructs a new Player instance and returns it. Player instances manage
 * holdings and are associated with one or more Hands which manage a set of
 * cards and the bets related to those cards.
 * @param {B.Game} g The game the player is in.
 * @param {number} h The holdings the player starts with.
 * @return {B.Player} A new Player instance.
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


	/**
	 * Sets the holdings value to a new value.
	 * @param {number} value The new value for holdings.
	 */
	this._setHoldings = function(value) {
		holdings = value;
	}

	return this;
};


/**
 * Adjustes the receiver's holdings by the amount provided. This method is
 * typically invoked when a Hand owned by the receiver requests a minimum bet
 * amount or the bet amount on a Hand is increased.
 * @param {number} amount The amount to adjust holdings by.
 */
B.Player.prototype.increaseBet = function(hand, amount) {

	// TODO:

	this._setHoldings(this.getHoldings() += amount);
};


// TODO:	not enough money to play? exit or buy chips...


//  --------------------------------------------------------------------------- 

/*
 * NOTE: 
 * The Game interacts primarily with Hands and only indirectly with
 * Players. As a result the link between a Hand and a Player is maintained by the
 * Hand instance, not the Player instance, and most operations affecting a player
 * are driven from methods/event initially invoked on a specific Hand.
 */


/**
 * Creates a new Hand of Cards and returns it. The Hand actually owns the cards
 * and bet, while the Hand's player is responsible for activity related to
 * managing the player's chips. The Game instance provides each Hand with an
 * object to notify when the state of the Hand changes in lieu of pub/sub.
 * @param {B.Game} g The Game this Hand of cards is a part of.
 * @param {B.Player} p The Player of this particular Hand of cards.
 * @return {B.Hand} A new Hand instance.
 * @constructor
 */
B.Hand = function(g, p) {
	var bet,
		cards,
		fsm,
		game,
		player;


	/**
     * The current bet amount.
     * @type {number}
     */
	bet = null;


	/**
     * The array of cards in the Hand.
	 * @type {Array.<B.Card>}
     */
	cards = [];


	/**
	 * The state machine which controls overall hand logic.
	 * @type {StateMachine}
	 */
	fsm = StateMachine.create({
		initial: 'empty',
		error: function(evt, from, to, args, code, msg) {
			log('ERROR: Hand cannot transition from: ' + 
				from + ' state to: ' + to + ' state');
		},
		events: [
			// Each hit changes the state to help us know what options are
			// available. Note that you can't hit() on a triplet, the state
			// we get from using "double".
			{ name: 'hit', from: 'empty', to: 'single' },
			{ name: 'hit', from: 'single', to: 'pair' },
			{ name: 'hit', from: 'pair', to: 'active' },

			// Many events are only legal when the Hand is in the initial
			// pair state with two cards.
			{ name: 'split', from: 'pair', to: 'single' },
			{ name: 'double', from: 'pair', to: 'triplet' },
			{ name: 'surrender', from: 'pair', to: 'surrendered' },

			// You can bust from active or doubled states.
			{ name: 'bust', from: ['doubled', 'active'], to: 'busted' }
		]});

	// Configure a nice debugging log function to observe state transitions.
	fsm.onchangestate = function(evt, from, to) {
		log('Hand transitioned from: ' + 
			from + ' state to: ' + to + ' state');
	};

	if (DEBUG) {
		log('Initialized Hand state');
	}


	/**
	 * The game this Hand is a part of.
	 * @type {B.Game}
	 */
	game = g;


	/**
     * The player of the Hand, where funds for the Hand's bets are managed. Note
	 * that the Hand played on behalf of the Dealer has no player assigned.
	 * @type {B.Player}
	 */
	player = p;


	/**
	 * Returns the current bet amount.
	 * @return {number}
	 */
	this.getBet = function() {
		return bet;
	};


	/**
	 * Return the array of Card instances which make up the Hand. Note that the
	 * array returned is mutable, which is necessary for operations like hit()
	 * and split() to function. This could be altered for more security.
	 * @return {Array.<B.Card>} The card array.
	 */
	this.getCards = function() {
		return cards;
	};


	/**
     * Returns the state machine which controls the state of the Hand.
	 * @return {StateMachine} The StateMachine which controls the state of this
	 *     Hand.
	 */
	this.getFSM = function() {
		return fsm;
	};


	/**
	 * Returns the game this Player is part of.
	 * @return {B.Game} The game.
	 */
	this.getGame = function() {
		return game;
	};


	/**
	 * Returns the Player whose holdings are backing this Hand.
	 * @return {B.Player} The player.
	 */
	this.getPlayer = function() {
		return player;
	};


	// Connect the various FSM transition hooks to Hand methods.
	fsm.onpair = this.onpair.bind(this);
	// TODO:


	return this;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Hand.prototype, B.Printable);


/**
 * This Hand just went over 21. The player immediately loses any bet
 * associated with this Hand and the Hand's cards are discarded.
 */
B.Hand.prototype.bust = function() {
	var fsm;

	fsm = this.getFSM();
	this.getFSM().bust();

	// Notify the Game. This is key so the Game is aware of state changes with
	// the Hands. We could do this via pub/sub signaling as an alternative.
	this.getGame().bust(this);
};


/**
 * The bet for this Hand should be doubled and a single card should be added
 * to the Hand. Once the Hand receives that card no additional cards may be
 * added to the Hand.
 */
B.Hand.prototype.double = function() {
	var fsm;

	// The player must have enough chips to support this operation or the
	// increase fails.
	this.increaseBet(this.getBet());

	// Add a third card. Doing this will check the hand for bust().
	this.hit();

	// Hitting may have caused the hand to bust() in which case we're done.
	// But if we can still transition to double then we must not have busted
	// and can transition.
	if (fsm.can('double')) {
		// Update our state machine.
		fsm.double();
	
		// Notify Game of any "terminal state" for a Hand.
		this.getGame().double(this);
	}
};


/**
 * Returns the maximum bet for a Hand.
 * @return {number} The maximum bet amount.
 */
B.Hand.prototype.getMaximumBet = function() {
	return this.getGame().getMaximumBet();
};


/**
 * Returns the minimum bet for a Hand. This represents "table stakes".
 * @return {number} The minimum bet.
 */
B.Hand.prototype.getMinimumBet = function() {
	return this.getGame().getMinimumBet();
};


/**
 * Returns the score of the Hand. When aces are included in the Hand they
 * are counted as 11 unless such a count would cause the Hand to bust, in
 * which case they are counted as 1.
 * @return {number}
 */
B.Hand.prototype.getScore = function() {
	var s,
		aces,
		cards;

	s = 0;
	aces = 0;

	cards = this.getCards();

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
 * Adds a card to the Hand, provided that the current state allows it.
 * @param {B.Card} card The new card to add to the Hand.
 * @return {B.Hand} The receiver.
 */
B.Hand.prototype.hit = function(card) {
	var fsm,
		cards;

	fsm = this.getFSM();
	fsm.hit();

	cards = this.getCards();
	cards.push(card);


	// With every new card we test and invoke the bust() event if the card
	// has pushed us over our limit.
	if (this.getScore() > 21) {
		this.bust();
	}

	return this;
};


/**
 * Increases the amount bet on this Hand. The final amount must not exceed
 * the maximum bet limit for the current Game.
 * @param {number} amount The amount to increase the bet.
 */
B.Hand.prototype.increaseBet = function(amount) {
	var player;

	if ((bet + amount) > this.getMaximumBet()) {
		throw new Error('Bet exceeds maximum.');
	}

	player = this.getPlayer();
	if (player.getHoldings() < amount) {
		throw new Error('Bet exceeds player holdings.');
	}

	// Remove funds from the player and escrow them with the Hand.
	player.increaseBet(hand, amount);
};


/**
 * Officially "Blackjack" only occurs when there are two cards, an Ace and a
 * card with a value of 10. Other combinations which score 21 are "twenty-one"
 * but not "blackjack".
 * @return {boolean} True if the Hand represents a _visible_ Blackjack value.
 */
B.Hand.prototype.isBlackjack = function() {
	var cards,
		bjack;

	cards = this.getCards();

	// Two cards, second one can't be a hole card (don't prematurely expose
	// blackjacks in Dealer's hand), and score must equal 21.
	bjack = cards.length === 2 &&
		!cards[1].isHoleCard() &&
		this.getScore() === 21;

	// Update our state to keep from doing "stoopid" things :).
	if (bjack) {
		this.getFSM().blackjack();
	}

	return bjack;
};


/**	
 * This is a losing Hand. The bet associated with this Hand is forfeited.
 */
B.Hand.prototype.lose = function() {

	// TODO
	//this.discard();

	// The bet has already been removed from the player's holdings at the
	// time the bet was placed.
	return;
};


/**
 * Responds to notifications that the Hand has a pair of cards. This state is
 * interesting due to a need to check for blackjack etc.
 */
B.Hand.prototype.onpair = function() {
	// Test for blackjack status. This call will notify the Game as
	// needed if that status is true.
	this.isBlackjack();
};


/**	
 * The Hand was a tie. No change in holdings, but the current bets are
 * returned to the player's holdings.
 */
B.Hand.prototype.push = function() {

	// TODO
	// The bet returns to the player on a tie.

	player.adjustHoldings(this.getBet());

	return;
};


/**
 * Displays the hand's hole cards, if any. Upon show(), if the hand only has two
 * cards, it is checked for a Blackjack status.
 */
B.Hand.prototype.show = function() {
	var cards, 
		holes;

	holes = 0;
	cards = this.getCards();

	cards.map(function(card) {
		if (card.isHoleCard()) {
			holes++;
			card.isHoleCard(false);
		}
	});

	if (holes) {
		// Test for blackjack now that everything's visible.
		this.isBlackjack();
	}

	// TODO: trigger rendering update.
};


/**
 * Splits the Hand, creating a second Hand with the same player as the owner
 * and one of the two current cards as its first card.
 */
B.Hand.prototype.split = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.split();

	this.getFSM().split();

	// TODO

	// TODO: trigger rendering update.
};


/**	
 * Surrenders the Hand. The player's holdings are adjusted such that they
 * forfeit half of their current bet.
 */
B.Hand.prototype.surrender = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.surrender();

	// Notify Game of any "terminal state" for a Hand.
	this.getGame().surrender(this);

	// TODO

	//	owner.adjustHoldings(bet * -0.5);

	// TODO: trigger rendering update.
};


/**
 * This is a winning Hand! The player's holdings are adjusted based on the
 * odds associated with the Hand (3:2 by default).
 */
B.Hand.prototype.win = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.win();

	// TODO
	//owner.adjustHoldings(bet * (odds || 1.5));
};


//  --------------------------------------------------------------------------- 
//  Game
//  --------------------------------------------------------------------------- 

/**
 * Creates and returns a new Game instance. The Game is responsible for overall
 * flow between dealing, processing the player's Hand(s), and scoring the final
 * result after the dealer's Hand has been filled.
 * @param {object} opts Optional game control parameters. Common keys are
 *	   decks (how many decks), min (minimum bet), max (maximum bet), chips
 *	   (initial player holdings).
 * @return {B.Game} A new Game instance.
 * @constructor
 */
B.Game = function(opts) {
	var fsm,
		options;

	/**
	 * The state machine which embodies the game state and transitions.
	 * Effectively the game goes from a pregame state to dealing the initial
	 * hands. From there all player hands are managed until no hands remain
	 * "playable". Once that's true the game moves to the dealer. Before the
	 * dealer does anything else a player can opt for insurance _iff_ the
	 * dealer's up-card is an Ace. Otherwise the dealer's hand is managed using
	 * the rules for stay/hit until the dealer's hand is no longer "playable".
	 * If the dealer doesn't bust a final scoring/payout phase is done and the
	 * game ends, resetting to allow a new deal to begin or for the entire game
	 * to be exited.
     * @type {StateMachine} The newly created/initialized state machine.
	 */
	fsm = StateMachine.create({
		initial: 'pregame',
		error: function(evt, from, to, args, code, msg) {
			log('ERROR: Game cannot transition from: ' + 
				from + ' state to: ' + to + ' state');
		},
		events: [
			{ name: 'deal', from: ['pregame', 'postgame'], to: 'dealing' },

			{ name: 'player', from: 'dealing', to: 'player' },
			{ name: 'insure', from: 'player', to: 'insure' },
			{ name: 'dealer', from: ['player', 'insure'], to: 'dealer' },

			{ name: 'bust', from: 'dealer', to: 'bust'},
			{ name: 'score', from: 'dealer', to: 'scoring' },

			{ name: 'payout', from: 'scoring', to: 'done' },

			{ name: 'quit', from: 'postgame', to: 'done' }
		]});

	// Configure a nice debugging log function to observe state transitions.
	fsm.onchangestate = function(evt, from, to) {
		log('Game transitioned from: ' + 
			from + ' state to: ' + to + ' state');
	};

	if (DEBUG) {
		log('Initialized Game state');
	}

	/**
	 * An optional object whose key/value pairs provide configuration data.
	 * @type {object}
	 */
	options = opts;


	/**
     * Returns the state machine which controls the state of the Hand.
	 * @return {StateMachine} The StateMachine which controls the state of this
	 *     Hand.
	 */
	this.getFSM = function() {
		return fsm;
	};


	/**
	 * Returns any startup configuration options for the game. Note that the
	 * options are mutable so they can be modified by callers.
	 * @return {object} Startup options.
	 */
	this.getOptions = function() {
		return opts;
	};

	// Initialize using any options provided.
	this.init(opts);

	return this;
};


/**
 * A Dictionary of default values for the class.
 * @enum {object}
 */
B.Game.DEFAULT = {
	DECK_COUNT: 1,			// Default is a single-deck game.
	HOLDINGS: 500,			// Default is 500 chips.
	MAXIMUM_BET: 100,		// No more than 100 chips per Hand.
	MINIMUM_BET: 1,			// 1 chip minimum.
	PLAYER_COUNT: 1			// 1 player by default.
};


/**
 * The dealer's Hand. We hold this Hand separate for easy comparison with player
 * Hands which are kept in the hands[] array.
 * @type {B.Hand}
 */
B.Game.prototype.dealer = null;


/**
 * The number of decks in the Game's Shoe. Default is DEFAULT.DECK_COUNT [1].
 * @type {number}
 */
B.Game.prototype.decks = B.Game.DEFAULT.DECK_COUNT;


/**
 * The state machine which controls overall game flow. Note that Hand instance
 * have their own state machine tracking the logic specific to playing a Hand.
 * @type {StateMachine}
 */
B.Game.prototype.fsm = null;


/**
 * A list of all player Hands currently active.  This is an array to support a
 * player having multiple Hands due to splitting.
 * @type {Array.<B.Hand>}
 */
B.Game.prototype.hands = null;


/**
 * The default starting holdings for the player.
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
 * The player for the game.
 * @type {B.Player}
 */
B.Game.prototype.player = null;


/**
 * The Shoe used to deal cards for the game.
 * @type {B.Shoe}
 */
B.Game.prototype.shoe = null;


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
		this.decks = options.decks || this.decks;
		this.maxBet = options.max || this.maxBet;
		this.minBet = options.min || this.minBet;
		this.holdings = options.chips || this.holdings;
	}

	this.shoe = new B.Shoe(this.decks);
	this.player = new B.Player(this, this.holdings);
	this.hands = [];

	// TODO:
	// Connect the various FSM transition hooks to game methods.

	return this;
};


/**
 * Invoked when a Hand has a blackjack (Ace and ten-value).
 */
B.Game.prototype.blackjack = function(hand) {
	if (hand === this.getHand()) {
	}
};


/**
 * Invoked when a Hand busts. If the Hand was the dealer's Hand then any active
 * hands remaining are winners. If the Hand was a player's Hand then it is
 * discarded from the Game. If no active player Hands remain the Game ends and
 * the option to deal a new set of Hands is provided.
 */
B.Game.prototype.bust = function(hand) {
	if (hand === this.getHand()) {
	}
};


/**
 * Handles state transition after the initial deal for a new game is done. While
 * the first two cards are being dealt to each player no UI actions are allowed.
 * Once the initial deal has completed the game moves into "player" mode in
 * which the player's state machine is in control of one or more Hands.
 */
B.Game.prototype.deal = function() {
	var fsm,
		shoe,
		my;

	fsm = this.getFSM();
	fsm.deal();

	// Capture this for lazy 'bind' via closure.
	my = this;
	shoe = this.getShoe();

	// Note that the dealer's Hand has no Player assigned. For simplification
	// the "Game" plays the Dealer's Hand.
	this.dealer = new B.Hand();

	// Create an initial Hand for the player.
	this.hands.length = 0;
	my.hands.push(new B.Hand(this.player));

	// Now that we have the Hands built we need to deal them some cards in the
	// proper order.
	this.hands.map(function(hand) {
		hand.hit(shoe.deal());
	});
	this.dealer.hit(shoe.deal());

	this.hands.map(function(hand) {
		hand.hit(shoe.deal());
	});

	// NOTE that in European / Australian rules we might not deal this second
	// card. Even when we do, we request this card as a hole card.
	this.dealer.hit(shoe.deal(true));

	this.renderHands(this.play.bind(this));
};


/**
 */
B.Game.prototype.payout = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.payout();

	this.getHands().map(function(hand) {
		hand.win();
	});
};


/**
 * Invoked after the initial deal has occurred and the initial hands have
 * rendered. 
 */
B.Game.prototype.play = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.player();

	// At this point initial hands are dealt and rendered. Now it's up to the
	// event handlers on the hands themselves to tell us what's going on. At
	// some point those handlers will trigger such that the Game can recognize
	// that all hands have run out of playing options (they've busted, doubled,
	// or stood and can't take more cards). When that happens the game will
	// transition from player to insurance or dealer state.
};


/**
 */
B.Game.prototype.quit = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.quit();

	// TODO: clear all game state and redisplay the splash screen to support
	// moving into test() mode or invoking a new game() sequence.
};


/**
 */
B.Game.prototype.renderHands = function(callback) {

	// TODO:	do some d3/canvas stuff here :)

	if (typeof callback === 'function') {
		callback();
	}
};


/**
 */
B.Game.prototype.renderTable = function(callback) {

	// TODO:	do some d3/canvas stuff here :)

	if (typeof callback === 'function') {
		callback();
	}
};


/**
 * Start a new game, triggering initial rendering and dealing to start a Hand.
 */
B.Game.prototype.start = function() {
	// Render the game table baseline, and deal when that's completed.
	this.renderTable(this.deal.bind(this));
};


//  --------------------------------------------------------------------------- 
//  Application Bootstrap
//  --------------------------------------------------------------------------- 

/*
 * NOTE:
 */


/**
 * Options for configuration of any Game/Test instances.
 * @type {object} 
 */
B.options = null;


/**
 */
B.handleGameClick = function() {

	// TODO:	Fade out splash, fade in gameboard.

	B.game = new B.Game(B.options);
	B.game.start();
};


/**
 */
B.handleTestClick = function() {
	
	// TODO:	Fade out splash, fade in test console.

	B.test = new B.Test(B.options);
	B.test.start();
};


/**
 * Initializes the game and starts it.
 * @param {object} options Optional game configuration options.
 */
B.init = function(options) {

	DEBUG = window.location.href.toString().match(/#debug|&debug=true/);
	if (DEBUG) {
		log('Debugging output enabled.');
	}

	// Cache options for use across all Game/Test invocations.
	B.options = options;

	// TODO: hook splash screen Game button and Test button. Game button creates
	// a new Game instance and starts it. Test button creates a new Test
	// instance and starts it.
	B.handleGameClick();
};


/**
 * Resets the outer application harness to a pre-click state.
 */
B.reset = function() {

	if (B.game) {
		// TODO:	reverse the fade in/out for splash/game UI.
	} else {
		// TODO:	reverse the fade in/out for splash/test UI.
	}

	// Release references so GC can do it's thing.
	B.game = null;
	B.test = null;
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
