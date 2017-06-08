/**
 * RESTO SHAMAN ANALYZER
 *		
 *	Calculates the benefit of a resto shaman's mastery.
 *	Includes:
 *		- Mean health of t
 *		- Amount of healing benefit, both as a raw number and as a % of your total healing.
 *
 */
class RestoShamanSubAnalyzer {
	
	constructor(playerName, playerInfo, fight, enemyNameMapping) {
		this.playerName = playerName;
		this.playerInfo = playerInfo;
		this.fight = fight;
		this.enemyNameMapping = enemyNameMapping;
		
		this.shamanBlueColor = '2359ff';
		this.darkGrayColor = '888888';
		
		// these are the spells that can be boosted by Mastery
		this.shamanHeals = new Map();
		this.shamanHeals.set(1064, "Chain Heal");
		this.shamanHeals.set(61295, "Riptide");
		this.shamanHeals.set(209069, "Tidal Totem"); // todo maybe combine this with riptide?
		this.shamanHeals.set(52042, "Healing Stream Totem");
		this.shamanHeals.set(207360, "Queen's Decree");
		this.shamanHeals.set(77472, "Healing Wave");
		this.shamanHeals.set(114942, "Healing Tide Totem");
		this.shamanHeals.set(8004, "Healing Surge");
		this.shamanHeals.set(73921, "Healing Rain");
		this.shamanHeals.set(207778, "Gift of the Queen");
		this.shamanHeals.set(73685, "Unleash Life");
		this.shamanHeals.set(197995, "Wellspring"); // could also be 197997
		// this.shamanHeals.set(157503, "Cloudburst");
		// this.shamanHeals.set(114083, "Restorative Mists");
		// this.shamanHeals.set(114911, "Ancestral Guidance");

		// these spells don't directly benefit from mastery.
		this.shamanAlreadyMasteryBoostedHeals = new Map();
		this.shamanAlreadyMasteryBoostedHeals.set(157503, "Cloudburst");
		this.shamanAlreadyMasteryBoostedHeals.set(114083, "Restorative Mists");
		this.shamanAlreadyMasteryBoostedHeals.set(114911, "Ancestral Guidance");

		this.shamanBuffs = new Map();
		this.shamanBuffs.set(157153, "Cloudburst");
		this.shamanBuffs.set(114052, "Ascendance");
		this.shamanBuffs.set(108281, "Ancestral Guidance");

		// buff IDs
		// 242586 = concordance
		// 53390 = tidal waves
		// 207288 = queen ascendant
		// 2645 = ghost wolf
		// 207527 = ghost in the mist
		// 77762 = lava surge
		// 209950 = caress of the tidemother
		// 216251 = undulation
		// 108280 = healing tide totem
		// 235966 = velen's future sight
		// 224151 = traitor's oath
		// 108271 = astral shift
		// 114052 = ascendance
		// 108281 = ancestral guidance
		// 208899 = queen's decree 10% hp buff
		// 207778 = gift of the queen
		// 79206 = spiritwalker's grace
		// 2825 = bloodlust
		// 208416 = sense of urgency
		// 61295 = riptide
		// 207654 = servant of the queen

		// todo MAYBE I should attribute the mastery healing from that extra 10% health of future heals on targets
		// that hace the queen's decree buff to Gift of hte Queen. I already capture the heal... it would just 
		// move it from other spells into gift of the queen. It should be a small amount and I'm not sure anyone cares.

		//todo calculate value from extra HP from ancestral vigor
		//this.shamanHeals.set(0, "Ancestral Vigor"); // this is not a spell, but I want to add healing to it manually so I want it 
		
		this.baseMasteryPercent = 21;
		this.masteryRatingPerOne = 133.33;
		
		this.playerId = this.playerInfo.sourceID;
		this.baseMasteryRating = this.playerInfo.mastery;
		
		this.totalHealing = 0; // total healing from all spells
		this.totalNonSpellHealing = 0;
		this.totalNoMasteryHealing = 0; // total healing before mastery
		this.shamanSpellNoMasteryHealing = 0; // total healing before mastery from spells that benefit from mastery

		this.cloudburstActive = false;
		this.ancestralGuidanceActive = false;
		this.ascendanceActive = false;
		
		this.spellHealingMap = new Map(); // map from the spell ID to obj with the direct and mastery healing
		for (let spellId of this.shamanHeals.keys()) {
			this.spellHealingMap.set(spellId, {'direct':0, 'mastery_amount':0, 'mastery_amount_overheal_adj':0 'num_heals':0, 'health_percentage':0});
			// direct: total amount healed by the spell
			// mastery_amount: amount of healing from mastery
			// mastery_amount_overheal_adj: amount of healing done by mastery that wouldn't have been covered by overheals.
			// num_heals: number of times this spell healed a target
			// health_percentage: this is a running total of all percentages. It will be divided by num_heals later 
			//						to get an average % health of targets healed by this spell
		}

		// these only need the amount they healed logged
		this.nonspellHealingMap = new Map(); // map from the spell ID to obj with 
		for (let spellId of this.shamanAlreadyMasteryBoostedHeals.keys()) {
			this.nonspellHealingMap.set(spellId, {'direct':0, 'attributable_mastery_amount':0});
		}

		// there is probably a better way to do this... but since they have different spell IDs I can't
		// map just by spell Id.
		this.shamanBuffMap = new Map(); // map from the spell ID to obj with 
		for (let spellId of this.shamanBuffs.keys()) {
			this.shamanBuffs.set(spellId, {'active':0}); // active 0 = false, 1 = true;
		}
	}
	
	/*
	 * Methodology:
	 * Per friendly target, track their current health. When analyzed spells
	 * heal the friendly target, calculate how much was due to mastery, and add
	 * that to a running total. Be careful to handle overhealing correctly by
	 * only adding the contribution from mastery that did not go into more
	 * overhealing.
	 * 
	 * Want to track the avg % health of targets healed, per spell, weighted by amount healed.
	 * 
	 * Shortcomings:
	 * Does not handle mastery buffs/procs that happen in the middle of the fight.
	 */
	 parse(wclEvent) {
		 
		if(wclEvent.type === 'combatantinfo') {
			this.combatantInfo(wclEvent);
		}
		 
		if(wclEvent.sourceID !== this.playerId) {
			return;
		}
		
		switch( wclEvent.type ) {
			case 'applybuff' :
				this.applyBuff(wclEvent);
				break;
			case 'removebuff' :
				this.removeBuff(wclEvent);
				break;
			case 'heal' :
				this.heal(wclEvent);
				break;
			case 'absorbed' :
				this.absorbed(wclEvent);
				break;
			default :
		}
	}

	// to calculate the value of mastery we use the following forumulas: 
	// 	base heal + mastery contribution = total heal
	// base heal + base heal * mastery multiplier = total heal
	// base heal + base heal * (mastery % / 100) * (health % / 100) = total heal
	
	// mastery contribution = base heal * (mastery % / 100) * (health % / 100)
	
	// in order to know the mastery contribution, we need to calculate the base heal:
	// base heal + base heal * (mastery % / 100) * (health % / 100) = total heal
	// base heal (1 + (1 * (mastery % / 100) * (health % / 100))) = total heal
	// base heal = total heal / (1 + (1 * (mastery % / 100) * (health % / 100)))
	
	// THEREFORE
	
	// mastery contribution = total heal / (1 + (1 * (mastery % / 100) * (health % / 100))) * (mastery % / 100) * (health % / 100)
	
	// parse 'combatantinfo' event
	combatantInfo(wclEvent) {	
		let targetId = wclEvent.sourceID; // aura's target is combatantinfo source
	}

	// parse 'apply buff' event
	applyBuff(wclEvent) {
		let targetId = wclEvent.targetID;
		let buffSpellId = wclEvent.ability.guid;

		if (this.playerId == targetId) {	
			console.log("applied buff " + buffSpellId + " found");

			for (let [spellId,name] of this.shamanBuffMap.entries()) {
				console.log("spellId of shamanBuffs entries: " + spellId);
				if (buffSpellId == spellId) {
					this.shamanBuffs.get(spellId).active = 1;
					console.log("buff spellId: " + spellId + " is applied");
				}
			}
		}

	}
	
	// parse 'remove buff' event
	removeBuff(wclEvent) {
		let targetId = wclEvent.targetID;
		let buffSpellId = wclEvent.ability.guid;

		if (this.playerId == targetId) {	
			console.log("applied buff " + buffSpellId + " found");

			for (let [spellId,name] of this.shamanBuffMap.entries()) {
				console.log("spellId of shamanBuffs entries: " + spellId);
				if (buffSpellId == spellId) {
					this.shamanBuffs.get(spellId).active = 0;
					console.log("buff spellId: " + spellId + " is removed");
				}
			}
		}
	}

	getHealHealthPercent(healAmount, maxHealth, currentHealth) {
		let preHealHealth = currentHealth - healAmount;
		return (preHealHealth / maxHealth) * 100;
	}

	// TODO not done.

	// should also calculate the crit and vers overhealing done (and haste for hots) for comparison
	getMasteryHealingAmountOverhealAdjusted(healAmount, overhealAmount, maxHealth, currentHealth) {
		let hhp = this.getHealHealthPercent(healAmount, maxHealth, currentHealth);
		let masteryFactor = 1 + (getCurrMasteryPercentage()/100 * (100-hhp)/100);
		let healingAmountFromMastery = getMasteryHealingAmount(healAmount, maxHealth, currentHealth);
		let nonmasteryOverheal = overhealAmount - (overhealAmount / masteryFactor);
		// subtract from the mastery healing any non-mastery overhealing that has been done.
		let overhealAdjusted = Math.max(healingAmountFromMastery - nonmasteryOverheal, 0);

		return Math.round(overhealAdjusted);
	}

	getBaseHeal(healAmount, maxHealth, currentHealth) {
		let currMasteryPercent = this.getCurrMasteryPercentage();
		let healHealthPercent = this.getHealHealthPercent(healAmount, maxHealth, currentHealth);
		return Math.round(healAmount / (1 + (1 * currMasteryPercent/100) * (1-(healHealthPercent/100))));
	}

	// not used -- not checked for accuracy
	getMasteryHealingPercentage(healAmount, maxHealth, currentHealth) {
		let hhp = this.getHealHealthPercent(healAmount, maxHealth, currentHealth);
		return (this.getCurrMasteryPercentage() * ((100-hhp)/100));
	}

	getMasteryHealingAmount(healAmount, maxHealth, currentHealth) {
		// could also use mastery contribution = total heal / (1 + (1 * (mastery % / 100) * (health % / 100))) * (mastery % / 100) * (health % / 100)
		// but I already made the get base heal function which has the same math, so might as well just subtract from healAmount.
		return Math.round(healAmount - this.getBaseHeal(healAmount, maxHealth, currentHealth));
	}
	
	// parse 'heal' event
	heal(wclEvent) {
		let targetId = wclEvent.targetID;
		let spellId = wclEvent.ability.guid;
		
		let amount = wclEvent.amount;
		let overhealAmount = wclEvent.overheal;
		let maxHP = wclEvent.maxHitPoints;
		let hp = wclEvent.hitPoints;

		let healMasteryAmount = this.getMasteryHealingAmount(amount, maxHP, hp);
		let healMasteryAmountOverhealAdjusted = this.getMasteryHealingAmountOverhealAdjusted(amount, maxHP, hp);
		let baseHealAmount = this.getBaseHeal(amount, maxHP, hp);
		let healHealthPercent = this.getHealHealthPercent(amount, maxHP, hp);

		if (wclEvent.absorbed !== undefined) { // absorbed healing is effective healing
			amount+= wclEvent.absorbed;
		}
		
		this.totalHealing += amount;
		
		if (this.spellHealingMap.has(spellId)) {
			this.spellHealingMap.get(spellId).direct += amount;
		} else if (this.nonspellHealingMap.has(spellId)) {
			this.nonspellHealingMap.get(spellId).direct += amount;
		}
		
		if (this.shamanHeals.has(spellId)) { // spell was boosted by mastery
			this.spellHealingMap.get(spellId).num_heals++;
			this.spellHealingMap.get(spellId).health_percentage += healHealthPercent; 
			this.spellHealingMap.get(spellId).mastery_amount += healMasteryAmount;
			this.spellHealingMap.get(spellId).mastery_amount_overheal_adj += healMasteryAmountOverhealAdjusted;
			this.totalNoMasteryHealing += baseHealAmount;

		} else if (this.shamanAlreadyMasteryBoostedHeals.has(spellId)) {
			// don't count towards no mastery healing if the spell was not a spell boosted by mastery,
			// but was indirectly boosted by mastery.
			this.totalNonSpellHealing += amount;
		} else { // spell not boosted by mastery
			this.totalNoMasteryHealing += amount;
		}
	}
	
	// parse 'absorbed' event
	absorbed(wclEvent) {
		// absorbs don't interact with mastery, but they do count towards total healing
		this.totalHealing += wclEvent.amount;
		this.totalNoMasteryHealing += wclEvent.amount;
	}
	
	getResult() {
		let res = $('<div>', {"class":"panel panel-default"});
		
		let playerNameElement = $('<div>', {"class":"panel-heading"})
				.html(toColorHtml("<b>" + this.playerName + " 🍂</br>", this.shamanBlueColor))
				.appendTo(res);
		
		let spellListElement = $('<ul>', {"class":"list-group"})
				.appendTo(res);
				
		let avgTotalMasteryHealing =
				roundTo(this.totalHealing - this.totalNoMasteryHealing - this.totalNonSpellHealing, 2);
		let avgTotalMasteryHealingOverhealingAdjusted = 
				roundTo(this.totalHealing - this.totalNoMasteryHealing - this.totalNonSpellHealing, 2);
		let percentageMasteryHealing = 
				roundTo((avgTotalMasteryHealing/(this.totalHealing-this.totalNonSpellHealing)) * 100, 2);

		// add the average mastery healing amount at the top.
		$('<li>', {"class":"list-group-item small"})
				.html("<p><b>Average Mastery Healing</b></p>" +
						"&emsp;Raw Healing Due to Mastery: <b>" + avgTotalMasteryHealing.toLocaleString() + "</b><br>" +
						"&emsp;Mastery Healing as % of Total Healing: <b>" + percentageMasteryHealing + "%</b><br>")
				.appendTo(spellListElement);
		
		// add report for each spell
		let spellText = "<p><b>Spell Mastery Contributions</b></p>";
		for(let [spellId, spellHealingObj] of this.spellHealingMap.entries()) {
			if(spellHealingObj.direct == 0) {
				console.log("No healing from spell ID " + spellId);
				continue; // don't include result entry for spell you never used
			} else {
				console.log("Healing from spell ID " + spellId);
			}
			
			let directPercent = roundTo(spellHealingObj.direct / (this.totalHealing - this.totalNonSpellHealing) * 100, 1);
			let masteryPercent = roundTo((spellHealingObj.mastery_amount / (this.totalHealing - this.totalNonSpellHealing)) * 100, 1);
			let avgTargetHealth = roundTo((this.spellHealingMap.get(spellId).health_percentage / this.spellHealingMap.get(spellId).num_heals), 2);		
			spellText += "<p>&emsp;" + getSpellLinkHtml(spellId, this.shamanHeals.get(spellId)) +
					'<br>&emsp;&emsp;Direct: <b>' + directPercent + "%</b> " +
					toColorHtml("(" + spellHealingObj.direct.toLocaleString() + ")", this.darkGrayColor) +
					'<br>&emsp;&emsp;Mastery: <b>' + masteryPercent + "%</b> " +
					toColorHtml("(" + spellHealingObj.mastery_amount.toLocaleString() + ")", this.darkGrayColor) +
					'<br>&emsp;&emsp;Avg Health: <b>' + avgTargetHealth + "%</b> " +
					"</p>";
		}

		$('<li>', {"class":"list-group-item small"})
				.html(spellText)
				.appendTo(spellListElement);
		
		// report raw total healing done
		$('<li>', {"class":"list-group-item small"})
				.html(toColorHtml("Total Healing: " + this.totalHealing.toLocaleString(), this.darkGrayColor))
				.appendTo(spellListElement);
		
		return res;
	}

	// uses curr mastery rating (including buffs), and calcs mastery % from it
	getCurrMasteryPercentage() {
		let currMasteryRating = this.baseMasteryRating;
		
		return this.masteryRatingToBonus(currMasteryRating) * 100;
	}

		// gets bonus multiplier from mastery rating
	masteryRatingToBonus(rating) {
		return (this.baseMasteryPercent + (rating / this.masteryRatingPerOne)) / 100;
	}
	
}

