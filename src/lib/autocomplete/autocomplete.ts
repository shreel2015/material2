import {
  AfterContentInit,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  Input,
  Output,
  Provider,
  ViewEncapsulation,
  NgModule,
  ModuleWithProviders
} from '@angular/core';
import {NG_VALUE_ACCESSOR, ControlValueAccessor, FormsModule} from '@angular/forms';
import {CommonModule} from '@angular/common';
import {HighlightPipe} from './autocomplete-pipe';
import {coerceBooleanProperty, UP_ARROW, DOWN_ARROW, ENTER, TAB} from '../core';
import {Observable} from 'rxjs/Observable';

class Item {
  public text: string;
  public value: string;

  constructor(source: any, textKey: string, valueKey: string) {
    if (typeof source === 'string') {
      this.text = this.value = source;
    }
    if (typeof source === 'object') {
      this.text = source[textKey];
      this.value = valueKey ? source[valueKey] : source;
    }
  }
}

const noop = () => { };

let nextId = 0;

export const MD2_AUTOCOMPLETE_CONTROL_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => Md2Autocomplete),
  multi: true
};

@Component({
  moduleId: module.id,
  selector: 'md2-autocomplete',
  templateUrl: 'autocomplete.html',
  styleUrls: ['autocomplete.css'],
  providers: [MD2_AUTOCOMPLETE_CONTROL_VALUE_ACCESSOR],
  host: {
    'role': 'autocomplete',
    '[id]': 'id',
    '[class.md2-autocomplete-disabled]': 'disabled',
    '[attr.aria-disabled]': 'disabled'
  },
  encapsulation: ViewEncapsulation.None
})

export class Md2Autocomplete implements AfterContentInit, ControlValueAccessor {

  constructor(private element: ElementRef) { }

  ngAfterContentInit() { this._isInitialized = true; }

  private _changeEmitter: EventEmitter<any> = new EventEmitter<any>();
  private _textChangeEmitter: EventEmitter<any> = new EventEmitter<any>();

  @Output('change')
  get onChange(): Observable<any> {
    return this._changeEmitter.asObservable();
  }

  @Output('textChange')
  get onTextChange(): Observable<any> {
    return this._textChangeEmitter.asObservable();
  }

  private _value: any = '';
  private _readonly: boolean;
  private _required: boolean;
  private _disabled: boolean = false;
  private _isInitialized: boolean = false;
  private _onTouchedCallback: () => void = noop;
  private _onChangeCallback: (_: any) => void = noop;

  private _items: Array<any> = [];
  private list: Array<Item> = [];

  private focusedOption: number = 0;
  private inputBuffer: string = '';
  private selectedItem: Item = null;
  private inputFocused: boolean = false;
  private noBlur: boolean = true;

  @Input() id: string = 'md2-autocomplete-' + (++nextId);
  @Input() tabindex: number = 0;
  @Input() placeholder: string = '';
  @Input('item-text') textKey: string = 'text';
  @Input('item-value') valueKey: string = null;
  @Input('min-length') minLength: number = 1;

  @Input()
  get readonly(): boolean { return this._readonly; }
  set readonly(value) { this._readonly = coerceBooleanProperty(value); }

  @Input()
  get required(): boolean { return this._required; }
  set required(value) { this._required = coerceBooleanProperty(value); }

  @Input()
  get disabled(): boolean { return this._disabled; }
  set disabled(value) { this._disabled = coerceBooleanProperty(value); }

  @Input()
  set items(value: Array<any>) { this._items = value; }

  @Input()
  get value(): any { return this._value; }
  set value(value: any) {
    if (value !== this._value) {
      this._value = value;
      this.inputBuffer = '';
      if (value) {
        let selItm = this._items.find((i: any) => this.equals(this.valueKey ? i[this.valueKey] : i, value));
        this.selectedItem = new Item(selItm, this.textKey, this.valueKey);
        if (this.selectedItem) { this.inputBuffer = this.selectedItem.text; }
      }
      if (!this.inputBuffer) { this.inputBuffer = ''; }
      if (this._isInitialized) {
        this._onChangeCallback(value);
        this._changeEmitter.emit(value);
      }
    }
  }

  /**
   * Compare two vars or objects
   * @param o1 compare first object
   * @param o2 compare second object
   * @return boolean comparation result
   */
  private equals(o1: any, o2: any) {
    if (o1 === o2) { return true; }
    if (o1 === null || o2 === null) { return false; }
    if (o1 !== o1 && o2 !== o2) { return true; }
    let t1 = typeof o1, t2 = typeof o2, length: any, key: any, keySet: any;
    if (t1 === t2 && t1 === 'object') {
      keySet = Object.create(null);
      for (key in o1) {
        if (!this.equals(o1[key], o2[key])) { return false; }
        keySet[key] = true;
      }
      for (key in o2) {
        if (!(key in keySet) && key.charAt(0) !== '$' && o2[key]) { return false; }
      }
      return true;
    }
    return false;
  }

  get isMenuVisible(): boolean {
    return ((this.inputFocused || this.noBlur) && this.list && this.list.length && !this.selectedItem) && !this.readonly ? true : false;
  }

  /**
   * update scroll of suggestion menu
   */
  private updateScroll() {
    if (this.focusedOption < 0) { return; }
    let menuContainer = this.element.nativeElement.querySelector('.md2-autocomplete-menu');
    if (!menuContainer) { return; }

    let choices = menuContainer.querySelectorAll('.md2-option');
    if (choices.length < 1) { return; }

    let highlighted: any = choices[this.focusedOption];
    if (!highlighted) { return; }

    let top: number = highlighted.offsetTop + highlighted.clientHeight - menuContainer.scrollTop;
    let height: number = menuContainer.offsetHeight;

    if (top > height) {
      menuContainer.scrollTop += top - height;
    } else if (top < highlighted.clientHeight) {
      menuContainer.scrollTop -= highlighted.clientHeight - top;
    }
  }

  /**
   * input event listner
   * @param event
   */
  private inputKeydown(event: KeyboardEvent) {
      if (this.disabled) { return; }
      this._textChangeEmitter.emit(this.inputBuffer);
    switch (event.keyCode) {
      case TAB: this.listLeave(); break;
      

      case ENTER:
        event.preventDefault();
        event.stopPropagation();
        if (this.isMenuVisible) {
          this.select(event, this.focusedOption);
        }
        break;

      case DOWN_ARROW:
        event.preventDefault();
        event.stopPropagation();
        if (this.isMenuVisible) {
          this.focusedOption = (this.focusedOption === this.list.length - 1) ? 0 : Math.min(this.focusedOption + 1, this.list.length - 1);
          this.updateScroll();
        }
        break;
      case UP_ARROW:
        event.preventDefault();
        event.stopPropagation();
        if (this.isMenuVisible) {
          this.focusedOption = (this.focusedOption === 0) ? this.list.length - 1 : Math.max(0, this.focusedOption - 1);
          this.updateScroll();
        }
        break;
      default:
        setTimeout(() => {
          this.updateItems(new RegExp(this.inputBuffer, 'ig'));
        }, 10);
    }
  }

  /**
   * select option
   * @param event
   * @param index of selected item
   */
  private select(event: Event, index: number) {
    event.preventDefault();
    event.stopPropagation();
    this.selectedItem = this.list[index];
    this.inputBuffer = this.list[index].text;
    this.updateValue();
  }

  /**
   * clear selected suggestion
   */
  private onClear() {
    if (this.disabled) { return; }
    this.inputBuffer = '';
    this.selectedItem = null;
    this.updateItems(new RegExp(this.inputBuffer, 'ig'));
    this._value = this.selectedItem ? this.selectedItem.value : this.selectedItem;
    this.updateValue();
  }

  /**
   * update value
   */
  private updateValue() {
    this._value = this.selectedItem ? this.selectedItem.value : this.selectedItem;
    this._onChangeCallback(this._value);
    this._changeEmitter.emit(this._value);
    this.onFocus();
  }

  /**
   * component focus listener
   */
  private onFocus() {
    if (this.disabled) { return; }
    this.element.nativeElement.querySelector('input').focus();
  }

  /**
   * input focus listener
   */
  private onInputFocus() {
    this.inputFocused = true;
    this.updateItems(new RegExp(this.inputBuffer, 'ig'));
    this.focusedOption = 0;
  }

  /**
   * input blur listener
   */
  private onInputBlur() {
    this.inputFocused = false;
  }

  /**
   * suggestion menu mouse enter listener
   */
  private listEnter() { this.noBlur = true; }

  /**
   * suggestion menu mouse leave listener
   */
  private listLeave() { this.noBlur = false; }

  /**
   * Update suggestion to filter the query
   * @param query
   */
  private updateItems(query: RegExp) {
    if (this.inputBuffer.length < this.minLength) {
      this.list = [];
    }
    else {
      this.list = this._items.map((i: any) => new Item(i, this.textKey, this.valueKey)).filter(i => query.test(i.text));
      if (this.list.length && this.list[0].text !== this.inputBuffer) {
        this.selectedItem = null;
      }
    }
  }

  writeValue(value: any) {
    if (value !== this._value) {
      this._value = value;
      this.inputBuffer = '';
      if (value) {
        let selItm = this._items.find((i: any) => this.equals(this.valueKey ? i[this.valueKey] : i, value));
        this.selectedItem = new Item(selItm, this.textKey, this.valueKey);
        if (this.selectedItem) { this.inputBuffer = this.selectedItem.text; }
      }
      if (!this.inputBuffer) { this.inputBuffer = ''; }
    }
  }

  registerOnChange(fn: any) { this._onChangeCallback = fn; }

  registerOnTouched(fn: any) { this._onTouchedCallback = fn; }
}

export const MD2_AUTOCOMPLETE_DIRECTIVES = [Md2Autocomplete, HighlightPipe];

@NgModule({
  imports: [CommonModule, FormsModule],
  exports: MD2_AUTOCOMPLETE_DIRECTIVES,
  declarations: MD2_AUTOCOMPLETE_DIRECTIVES,
})
export class MdAutocompleteModule {
  static forRoot(): ModuleWithProviders {
    return {
      ngModule: MdAutocompleteModule,
      providers: []
    };
  }
}